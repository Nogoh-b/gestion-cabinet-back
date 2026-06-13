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
import { PayslipLine } from './entities/payslip-line.entity';
import { Payslip, PayslipStatus } from './entities/payslip.entity';
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

    const baseSalary = Number(dto.gross_amount) || 0;
    const entity = this.repository.create({
      ...dto,
      // net provisoire = brut saisi ; recalculé ci-dessous à partir des lignes
      net_amount: dto.net_amount ?? baseSalary,
      status: PayslipStatus.DRAFT,
    });
    entity.employee = employee;
    entity.period = period;
    const saved = await this.repository.save(entity);

    // ── Formulaire = salaire de base uniquement → le back génère le reste ──────
    // Pour une fiche normale : ligne de base + barème de cotisations + brut/net.
    // Pour une avance sur salaire : pas de génération automatique.
    if (!dto.is_advance && baseSalary > 0) {
      await this.generationService.applyBaseSalaryLines(saved.id, baseSalary, period.label);
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
    this.eventEmitter.emit('payslip.payee', full);
    return full;
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
