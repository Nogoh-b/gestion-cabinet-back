import { PaginationServiceV1 } from 'src/core/shared/services/pagination/paginations-v1.service';
import { BaseServiceV1, SearchOptions } from 'src/core/shared/services/search/base-v1.service';
import { addTenantCondition } from 'src/core/tenant/tenant-repository.patch';
import { getCurrentTenantId } from 'src/core/tenant/tenant.context';
import { Repository } from 'typeorm';
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';

import { Employee } from '../agencies/employee/entities/employee.entity';
import { PlanQuotaService } from '../plans/plan-quota.service';
import { CreatePayslipDto } from './dto/create-payslip.dto';
import { UpdatePayslipDto } from './dto/update-payslip.dto';
import { PayrollPeriod } from './entities/payroll-period.entity';
import { PayslipLine, PayslipLineType } from './entities/payslip-line.entity';
import { Payslip, PayslipStatus } from './entities/payslip.entity';
import { SalaryAdvance, SalaryAdvanceStatus } from './entities/salary-advance.entity';
import { PayrollCalculatorService } from './services/payroll-calculator.service';
import { PayrollGenerationService } from './services/payroll-generation.service';

@Injectable()
export class PayslipsService extends BaseServiceV1<Payslip> {
  constructor(
    protected readonly paginationService: PaginationServiceV1,
    @InjectRepository(Payslip)
    protected repository: Repository<Payslip>,
    @InjectRepository(PayslipLine)
    private lineRepo: Repository<PayslipLine>,
    @InjectRepository(Employee)
    private employeeRepo: Repository<Employee>,
    @InjectRepository(PayrollPeriod)
    private periodRepo: Repository<PayrollPeriod>,
    @InjectRepository(SalaryAdvance)
    private advanceRepo: Repository<SalaryAdvance>,
    private readonly planQuotaService: PlanQuotaService,
    private readonly calculator: PayrollCalculatorService,
    private readonly generationService: PayrollGenerationService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    super(repository, paginationService);
  }

  protected getDefaultSearchOptions(): SearchOptions {
    return {
      searchFields: [],
      relationFields: ['employee', 'employee.user', 'period'],
    };
  }

  async create(dto: CreatePayslipDto): Promise<Payslip> {
    // ── Le module Paie doit être inclus dans le plan + quota mensuel ─────────
    const tenantId = getCurrentTenantId();
    if (tenantId) {
      await this.planQuotaService.checkModuleEnabled(tenantId, 'payroll');
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      let qb = this.repository
        .createQueryBuilder('p')
        .where('p.created_at >= :start', { start: monthStart });
      qb = addTenantCondition(qb, 'p');
      const currentCount = await qb.getCount();
      await this.planQuotaService.checkLimit(tenantId, 'payslips', currentCount);
    }

    const employee = await this.employeeRepo.findOne({ where: { id: dto.employee_id } });
    if (!employee) throw new NotFoundException('Employé non trouvé');
    const period = await this.periodRepo.findOne({ where: { id: dto.period_id } });
    if (!period) throw new NotFoundException('Période de paie non trouvée');

    // ── Une seule fiche de paie par (collaborateur, période) ──────────────────
    // Les avances sur salaire sont désormais une entité dédiée (SalaryAdvance),
    // pas une fiche de paie : un employé n'a donc qu'un bulletin par période.
    const existing = await this.repository.findOne({
      where: { employee_id: dto.employee_id, period_id: dto.period_id },
    });
    if (existing) {
      throw new BadRequestException(
        'Une fiche de paie existe déjà pour ce collaborateur sur cette période.',
      );
    }

    const baseSalary = Number(dto.gross_amount) || 0;
    const entity = this.repository.create({
      employee_id: dto.employee_id,
      period_id: dto.period_id,
      gross_amount: baseSalary,
      // net provisoire = brut saisi ; recalculé ci-dessous à partir des lignes
      net_amount: dto.net_amount ?? baseSalary,
      notes: dto.notes,
      status: PayslipStatus.DRAFT,
    });
    entity.employee = employee;
    entity.period = period;
    const saved = await this.repository.save(entity);

    // ── Formulaire = salaire de base uniquement → le back génère le reste ──────
    // Ligne de base + barème de cotisations + récupération d'avances + brut/net.
    if (baseSalary > 0) {
      await this.generationService.applyBaseSalaryLines(saved.id, baseSalary, period.label);
    }

    // ── Honorer le statut demandé via le cycle de vie contrôlé ────────────────
    // On ne force jamais le statut « en dur » : on rejoue les transitions
    // officielles pour préserver snapshot d'audit + écritures comptables.
    const requested = dto.status;
    if (requested === PayslipStatus.VALIDATED || requested === PayslipStatus.PAID) {
      await this.validate(saved.id);
      if (requested === PayslipStatus.PAID) {
        await this.pay(saved.id); // émet payslip.payee → comptabilisation de la paie
      }
    }

    return this.findOne(saved.id);
  }

  findAll(): Promise<Payslip[]> {
    return this.repository.find({
      relations: ['employee', 'employee.user', 'period'],
      order: { created_at: 'DESC' },
    });
  }

  async findOne(id: number): Promise<Payslip> {
    const payslip = await this.repository.findOne({
      where: { id },
      relations: ['employee', 'employee.user', 'period', 'lines', 'lines.dossier'],
    });
    if (!payslip) throw new NotFoundException('Fiche de paie non trouvée');
    return payslip;
  }

  async findByPeriod(period_id: number): Promise<Payslip[]> {
    return this.repository.find({
      where: { period_id },
      relations: ['employee', 'employee.user', 'period'],
      order: { created_at: 'DESC' },
    });
  }

  async findByEmployee(employee_id: number): Promise<Payslip[]> {
    return this.repository.find({
      where: { employee_id },
      relations: ['employee', 'employee.user', 'period'],
      order: { created_at: 'DESC' },
    });
  }

  // ── Recalcul des totaux à partir des lignes ────────────────────────────────

  /**
   * Recalcule brut / net / retenues à partir des lignes du bulletin.
   * Source de vérité = les lignes. Si le bulletin n'a aucune ligne, on conserve
   * les montants saisis manuellement (compatibilité avec la saisie directe).
   */
  async recomputeTotals(id: number): Promise<Payslip> {
    const payslip = await this.findOne(id);
    this.assertMutable(payslip);
    const lines = payslip.lines ?? [];
    if (lines.length === 0) return payslip; // mode saisie manuelle

    const totals = this.calculator.computeTotals(lines);
    payslip.gross_amount = totals.gross_amount;
    payslip.net_amount = totals.net_amount;
    return this.repository.save(payslip);
  }

  // ── Cycle de vie ───────────────────────────────────────────────────────────

  /** Une fiche n'est modifiable qu'à l'état brouillon. */
  private assertMutable(payslip: Payslip): void {
    if (payslip.status !== PayslipStatus.DRAFT) {
      throw new ForbiddenException(
        `Fiche de paie ${payslip.status === PayslipStatus.PAID ? 'payée' : 'validée'} : non modifiable. Repassez-la en brouillon d'abord.`,
      );
    }
  }

  /** Valide un brouillon : fige les totaux et un instantané auditable. */
  async validate(id: number): Promise<Payslip> {
    const payslip = await this.findOne(id);
    if (payslip.status !== PayslipStatus.DRAFT) {
      throw new BadRequestException('Seul un brouillon peut être validé. ' + payslip.status);
    }
    const lines = payslip.lines ?? [];
    if (lines.length > 0) {
      const totals = this.calculator.computeTotals(lines);
      payslip.gross_amount = totals.gross_amount;
      payslip.net_amount = totals.net_amount;
    }
    if (Number(payslip.gross_amount) <= 0) {
      throw new BadRequestException('Le salaire brut doit être strictement positif pour valider.');
    }
    payslip.status = PayslipStatus.VALIDATED;
    payslip.snapshot = this.buildSnapshot(payslip);
    return this.repository.save(payslip);
  }

  /** Marque une fiche validée comme payée et déclenche la comptabilisation. */
  async pay(id: number): Promise<Payslip> {
    const payslip = await this.findOne(id);
    if (payslip.status === PayslipStatus.PAID) {
      throw new BadRequestException('Fiche déjà payée.');
    }
    if (payslip.status !== PayslipStatus.VALIDATED) {
      throw new BadRequestException('La fiche doit être validée avant paiement.');
    }
    payslip.status = PayslipStatus.PAID;
    payslip.payment_date = new Date();
    const saved = await this.repository.save(payslip);
    const full = await this.findOne(saved.id);
    // Impute la retenue d'avance sur les avances en cours (point irréversible).
    await this.realizeAdvanceRecovery(full);
    this.eventEmitter.emit('payslip.payee', full);
    return full;
  }

  /**
   * Au paiement d'un bulletin, impute le montant de la (des) ligne(s)
   * « Récupération avance sur salaire » sur les avances (SalaryAdvance) PAYÉES
   * en cours du collaborateur (plus anciennes d'abord), en incrémentant leur
   * `recovered_amount`. Une avance entièrement récupérée passe au statut
   * `recovered` et n'est plus proposée à la récupération sur les bulletins suivants.
   */
  private async realizeAdvanceRecovery(payslip: Payslip): Promise<void> {
    const recovery = (payslip.lines ?? [])
      .filter((l) => l.line_type === PayslipLineType.ADVANCE_RECOVERY)
      .reduce((s, l) => s + Math.abs(Number(l.amount) || 0), 0);
    if (recovery <= 0) return;

    let remaining = recovery;
    const advances = await this.advanceRepo.find({
      where: { employee_id: payslip.employee_id, status: SalaryAdvanceStatus.PAID },
      order: { id: 'ASC' },
    });
    for (const adv of advances) {
      if (remaining <= 0) break;
      const outstanding = Number(adv.amount || 0) - Number(adv.recovered_amount || 0);
      if (outstanding <= 0) continue;
      const take = Math.min(outstanding, remaining);
      adv.recovered_amount = Math.round((Number(adv.recovered_amount || 0) + take) * 100) / 100;
      // Avance entièrement remboursée → statut « récupérée ».
      if (adv.recovered_amount >= Number(adv.amount || 0) - 0.005) {
        adv.status = SalaryAdvanceStatus.RECOVERED;
      }
      remaining -= take;
      await this.advanceRepo.save(adv);
    }
  }

  /** Conservé pour compatibilité (ancien nom). */
  async markAsPaid(id: number): Promise<Payslip> {
    return this.pay(id);
  }

  /** Repasse une fiche validée en brouillon (annule la validation). Une fiche payée ne peut pas être annulée. */
  async revertToDraft(id: number): Promise<Payslip> {
    const payslip = await this.findOne(id);
    if (payslip.status === PayslipStatus.PAID) {
      throw new ForbiddenException('Une fiche payée ne peut pas être annulée (impact comptable).');
    }
    payslip.status = PayslipStatus.DRAFT;
    payslip.snapshot = null;
    return this.repository.save(payslip);
  }

  private buildSnapshot(payslip: Payslip): Record<string, any> {
    return {
      frozen_at: new Date().toISOString(),
      gross_amount: Number(payslip.gross_amount),
      net_amount: Number(payslip.net_amount),
      total_employer_charges: payslip.total_employer_charges
        ? Number(payslip.total_employer_charges)
        : null,
      lines: (payslip.lines ?? []).map((l) => ({
        line_type: l.line_type,
        label: l.label,
        amount: Number(l.amount),
        is_taxable: l.is_taxable,
      })),
    };
  }

  async update(id: number, dto: UpdatePayslipDto): Promise<Payslip> {
    const payslip = await this.findOne(id);
    this.assertMutable(payslip);

    if (dto.employee_id) {
      const employee = await this.employeeRepo.findOne({ where: { id: dto.employee_id } });
      if (!employee) throw new NotFoundException('Employé non trouvé');
      payslip.employee = employee;
    }

    if (dto.period_id) {
      const period = await this.periodRepo.findOne({ where: { id: dto.period_id } });
      if (!period) throw new NotFoundException('Période de paie non trouvée');
      payslip.period = period;
    }

    return this.repository.save({ ...payslip, ...dto });
  }

  async remove(id: number): Promise<void> {
    const payslip = await this.findOne(id);
    if (payslip.status === PayslipStatus.PAID) {
      throw new ForbiddenException('Une fiche payée ne peut pas être supprimée.');
    }
    await this.repository.softDelete(id);
  }
}
