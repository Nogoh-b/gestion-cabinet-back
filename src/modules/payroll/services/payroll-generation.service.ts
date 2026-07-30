import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Payslip, PayslipStatus } from '../entities/payslip.entity';
import { PayslipLine, PayslipLineType } from '../entities/payslip-line.entity';
import { PayrollPeriod } from '../entities/payroll-period.entity';
import {
  PayrollContribution,
  PayrollContributionStatus,
} from '../entities/payroll-contribution.entity';
import { SalaryAdvance, SalaryAdvanceStatus } from '../entities/salary-advance.entity';
import { Employee } from '../../agencies/employee/entities/employee.entity';
import { Dossier } from '../../dossiers/entities/dossier.entity';
import { PayrollCalculatorService } from './payroll-calculator.service';
import { getCurrentTenantId } from 'src/core/tenant/tenant.context';
import { User } from '../../iam/user/entities/user.entity';

export interface GenerationResult {
  period_id: number;
  eligible_employees: number;
  created: number;
  skipped_existing: number;
  skipped_no_salary: number;
  payslip_ids: number[];
}

/**
 * Génération automatique des bulletins d'une période.
 *
 * Pour chaque collaborateur actif (et rattaché à l'agence si précisée) :
 *   1. crée un bulletin brouillon s'il n'en existe pas déjà pour la période ;
 *   2. ajoute une ligne « salaire de base » depuis l'Employee.salary ;
 *   3. applique le barème de cotisations actif (retenues salariales) ;
 *   4. enregistre le total des charges patronales ;
 *   5. laisse le bulletin en brouillon (à valider manuellement).
 *
 * Idempotent : un bulletin déjà présent pour (employé, période) est ignoré.
 */
@Injectable()
export class PayrollGenerationService {
  private readonly logger = new Logger(PayrollGenerationService.name);

  constructor(
    @InjectRepository(Payslip) private readonly payslipRepo: Repository<Payslip>,
    @InjectRepository(PayslipLine) private readonly lineRepo: Repository<PayslipLine>,
    @InjectRepository(PayrollPeriod) private readonly periodRepo: Repository<PayrollPeriod>,
    @InjectRepository(PayrollContribution) private readonly contributionRepo: Repository<PayrollContribution>,
    @InjectRepository(SalaryAdvance) private readonly advanceRepo: Repository<SalaryAdvance>,
    @InjectRepository(Employee) private readonly employeeRepo: Repository<Employee>,
    @InjectRepository(Dossier) private readonly dossierRepo: Repository<Dossier>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly calculator: PayrollCalculatorService,
  ) {}

  async generateForPeriod(
    periodId: number,
    actorId: number,
    branchId?: number,
  ): Promise<GenerationResult> {
    const tenantId = getCurrentTenantId();
    if (!Number.isInteger(actorId) || actorId <= 0) {
      throw new ForbiddenException('Acteur authentifié obligatoire');
    }
    const actor = await this.userRepo.findOne({
      where: { id: actorId, tenant_id: tenantId },
    });
    if (!actor) throw new ForbiddenException('Utilisateur introuvable');
    const period = await this.periodRepo.findOne({
      where: { id: periodId, tenant_id: tenantId },
    });
    if (!period) throw new NotFoundException('Période de paie non trouvée');
    if (period.status !== 'draft') {
      throw new NotFoundException('La génération n\'est possible que sur une période en brouillon.');
    }

    const employees = await this.employeeRepo.find({
      where: { tenant_id: tenantId },
    });
    const contributions = await this.findApplicableContributions(
      period.end_date,
    );

    const result: GenerationResult = {
      period_id: periodId,
      eligible_employees: 0,
      created: 0,
      skipped_existing: 0,
      skipped_no_salary: 0,
      payslip_ids: [],
    };

    for (const emp of employees) {
      if (!emp.is_active) continue;
      if (branchId && Number(emp.branch_id) !== Number(branchId)) continue;
      result.eligible_employees++;

      const salary = Number(emp.salary);
      if (!salary || salary <= 0) {
        result.skipped_no_salary++;
        continue;
      }

      const existing = await this.payslipRepo.findOne({
        where: {
          employee_id: emp.id,
          period_id: periodId,
          tenant_id: tenantId,
        },
      });
      if (existing) {
        result.skipped_existing++;
        continue;
      }

      const payslip = await this.payslipRepo.save(
        this.payslipRepo.create({
          employee_id: emp.id,
          period_id: periodId,
          gross_amount: salary,
          net_amount: salary,
          status: PayslipStatus.DRAFT,
          prepared_by_id: actor.id,
          tenant_id: tenantId,
        }),
      );

      // Génère la ligne de salaire de base + les cotisations et recalcule les totaux
      await this.applyBaseSalaryLines(
        payslip.id,
        salary,
        period.label,
        contributions,
        period.end_date,
      );

      result.created++;
      result.payslip_ids.push(payslip.id);
    }

    this.logger.log(
      `Génération période ${periodId} : ${result.created} créés, ${result.skipped_existing} déjà existants, ${result.skipped_no_salary} sans salaire.`,
    );
    return result;
  }

  /**
   * Génère, pour un bulletin existant, la ligne « salaire de base » puis applique
   * le barème de cotisations actif (retenues salariales). Recalcule ensuite le
   * brut, le net et le total des charges patronales.
   *
   * Réutilisé par la génération en masse ET par la création unitaire d'un bulletin
   * (le formulaire ne saisit que le salaire de base, le back calcule le reste).
   *
   * @param contributions barème préchargé (optionnel) — sinon chargé depuis la base.
   */
  async applyBaseSalaryLines(
    payslipId: number,
    baseSalary: number,
    periodLabel: string,
    contributions?: PayrollContribution[],
    effectiveAt?: Date,
  ): Promise<{ gross: number; net: number; totalEmployer: number }> {
    const base = Number(baseSalary) || 0;
    const contribs =
      contributions ??
      (await this.findApplicableContributions(
        effectiveAt ?? new Date(),
      ));

    // Ligne salaire de base
    await this.lineRepo.save(
      this.lineRepo.create({
        payslip_id: payslipId,
        line_type: PayslipLineType.BASE_SALARY,
        label: `Salaire de base — ${periodLabel}`,
        amount: base,
        is_taxable: true,
      }),
    );

    // Application du barème de cotisations (part salariale → retenues)
    const baseTotals = this.calculator.computeTotals([
      { line_type: PayslipLineType.BASE_SALARY, amount: base, is_taxable: true } as PayslipLine,
    ]);
    const contrib = this.calculator.computeContributions(baseTotals, contribs);

    for (const d of contrib.employeeDeductions) {
      await this.lineRepo.save(
        this.lineRepo.create({
          payslip_id: payslipId,
          line_type: PayslipLineType.DEDUCTION,
          label: d.label,
          amount: d.amount,
          is_taxable: false,
          notes: `Cotisation ${d.code}`,
        }),
      );
    }

    // Récupération automatique des avances sur salaire en cours du collaborateur
    await this.applyAdvanceRecovery(payslipId);

    // Recalcul final des totaux + charges patronales
    const finalLines = await this.lineRepo.find({ where: { payslip_id: payslipId } });
    const finalTotals = this.calculator.computeTotals(finalLines);
    await this.payslipRepo.update(payslipId, {
      gross_amount: finalTotals.gross_amount,
      net_amount: finalTotals.net_amount,
      total_employer_charges: contrib.totalEmployer,
      contribution_snapshot: contribs.map((item) => ({
          id: item.id,
          code: item.code,
          version: item.version,
          label: item.label,
          rate: Number(item.rate),
          base_type: item.base_type,
          payer: item.payer,
          ceiling:
            item.ceiling == null ? null : Number(item.ceiling),
          account_number: item.account_number,
          valid_from: item.valid_from,
          valid_until: item.valid_until,
        })) as any,
    });

    return { gross: finalTotals.gross_amount, net: finalTotals.net_amount, totalEmployer: contrib.totalEmployer };
  }

  /**
   * Ajoute, le cas échéant, une ligne de retenue « Récupération avance sur
   * salaire » sur un bulletin. Le montant retenu = total des avances en cours
   * du collaborateur (avances SalaryAdvance PAYÉES non encore entièrement
   * récupérées), plafonné au net disponible avant récupération.
   *
   * Ne met PAS à jour `recovered_amount` des avances : l'imputation réelle est
   * faite au paiement du bulletin (PayslipsService.realizeAdvanceRecovery),
   * point irréversible du cycle de vie.
   */
  async applyAdvanceRecovery(payslipId: number): Promise<number> {
    const payslip = await this.payslipRepo.findOne({
      where: { id: payslipId, tenant_id: getCurrentTenantId() },
    });
    if (!payslip) return 0;

    const advances = await this.advanceRepo.find({
      where: {
        employee_id: payslip.employee_id,
        status: SalaryAdvanceStatus.PAID,
        tenant_id: getCurrentTenantId(),
      },
      order: { id: 'ASC' },
    });
    const totalOutstanding = advances.reduce(
      (s, a) => s + Math.max(0, Number(a.amount || 0) - Number(a.recovered_amount || 0)),
      0,
    );
    if (totalOutstanding <= 0) return 0;

    // Net disponible avant récupération (gains − cotisations déjà posées).
    const lines = await this.lineRepo.find({ where: { payslip_id: payslipId } });
    const netAvailable = this.calculator.computeTotals(lines).net_amount;
    if (netAvailable <= 0) return 0;

    const recovery = PayrollCalculatorService.round(Math.min(totalOutstanding, netAvailable));
    if (recovery <= 0) return 0;

    await this.lineRepo.save(
      this.lineRepo.create({
        payslip_id: payslipId,
        line_type: PayslipLineType.ADVANCE_RECOVERY,
        label: 'Récupération avance sur salaire',
        amount: recovery,
        is_taxable: false,
        notes:
          recovery < totalOutstanding
            ? `Retenue partielle — reste ${PayrollCalculatorService.round(totalOutstanding - recovery)} à récupérer`
            : 'Solde des avances en cours',
      }),
    );

    return recovery;
  }

  /**
   * Génère les lignes de commission interne d'un bulletin à partir des dossiers
   * clôturés sur la période, rattachés au collaborateur, selon un taux.
   * Le bulletin doit être en brouillon.
   */
  async generateCommissions(payslipId: number, ratePercent: number): Promise<PayslipLine[]> {
    const payslip = await this.payslipRepo.findOne({
      where: { id: payslipId, tenant_id: getCurrentTenantId() },
      relations: ['period'],
    });
    if (!payslip) throw new NotFoundException('Fiche de paie non trouvée');
    if (payslip.status !== PayslipStatus.DRAFT) {
      throw new NotFoundException('Commissions générables uniquement sur un brouillon.');
    }

    // Dossiers du collaborateur ayant des honoraires, sur la période.
    const dossiers = await this.dossierRepo.find({
      where: {
        deleted_at: IsNull(),
        tenant_id: getCurrentTenantId(),
      } as any,
      relations: [],
    });

    const created: PayslipLine[] = [];
    for (const d of dossiers as any[]) {
      const fees = Number(d.honoraires_ht ?? d.fees ?? 0);
      const managerId = Number(d.responsable_id ?? d.manager_id ?? 0);
      if (!fees || fees <= 0) continue;
      if (managerId !== Number(payslip.employee_id)) continue;

      const amount = PayrollCalculatorService.round((fees * ratePercent) / 100);
      if (amount <= 0) continue;

      const line = await this.lineRepo.save(
        this.lineRepo.create({
          payslip_id: payslip.id,
          line_type: PayslipLineType.INTERNAL_COMMISSION,
          label: `Commission ${ratePercent}% — dossier ${d.dossier_number ?? d.id}`,
          amount,
          is_taxable: true,
          dossier_id: d.id,
          notes: `${ratePercent}% des honoraires HT (${fees})`,
        }),
      );
      created.push(line);
    }

    if (created.length > 0) {
      const finalLines = await this.lineRepo.find({ where: { payslip_id: payslip.id } });
      const totals = this.calculator.computeTotals(finalLines);
      payslip.gross_amount = totals.gross_amount;
      payslip.net_amount = totals.net_amount;
      await this.payslipRepo.save(payslip);
    }
    return created;
  }

  private findApplicableContributions(
    effectiveAt: Date,
  ): Promise<PayrollContribution[]> {
    return this.contributionRepo
      .createQueryBuilder('contribution')
      .where('contribution.tenant_id = :tenantId', {
        tenantId: getCurrentTenantId(),
      })
      .andWhere('contribution.status = :status', {
        status: PayrollContributionStatus.PUBLISHED,
      })
      .andWhere('contribution.valid_from <= :effectiveAt', {
        effectiveAt,
      })
      .andWhere(
        '(contribution.valid_until IS NULL OR contribution.valid_until >= :effectiveAt)',
        { effectiveAt },
      )
      .orderBy('contribution.sort_order', 'ASC')
      .addOrderBy('contribution.code', 'ASC')
      .getMany();
  }
}
