import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Payslip, PayslipStatus } from '../entities/payslip.entity';
import { PayslipLine, PayslipLineType } from '../entities/payslip-line.entity';
import { PayrollPeriod } from '../entities/payroll-period.entity';
import { PayrollContribution } from '../entities/payroll-contribution.entity';
import { Employee } from '../../agencies/employee/entities/employee.entity';
import { Dossier } from '../../dossiers/entities/dossier.entity';
import { PayrollCalculatorService } from './payroll-calculator.service';

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
    @InjectRepository(Employee) private readonly employeeRepo: Repository<Employee>,
    @InjectRepository(Dossier) private readonly dossierRepo: Repository<Dossier>,
    private readonly calculator: PayrollCalculatorService,
  ) {}

  async generateForPeriod(periodId: number, branchId?: number): Promise<GenerationResult> {
    const period = await this.periodRepo.findOne({ where: { id: periodId } });
    if (!period) throw new NotFoundException('Période de paie non trouvée');
    if (period.status !== 'draft') {
      throw new NotFoundException('La génération n\'est possible que sur une période en brouillon.');
    }

    const employees = await this.employeeRepo.find();
    const contributions = await this.contributionRepo.find({ where: { is_active: true } });

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
        where: { employee_id: emp.id, period_id: periodId },
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
          is_advance: false,
        }),
      );

      // Génère la ligne de salaire de base + les cotisations et recalcule les totaux
      await this.applyBaseSalaryLines(payslip.id, salary, period.label, contributions);

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
  ): Promise<{ gross: number; net: number; totalEmployer: number }> {
    const base = Number(baseSalary) || 0;
    const contribs = contributions ?? (await this.contributionRepo.find({ where: { is_active: true } }));

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

    // Recalcul final des totaux + charges patronales
    const finalLines = await this.lineRepo.find({ where: { payslip_id: payslipId } });
    const finalTotals = this.calculator.computeTotals(finalLines);
    await this.payslipRepo.update(payslipId, {
      gross_amount: finalTotals.gross_amount,
      net_amount: finalTotals.net_amount,
      total_employer_charges: contrib.totalEmployer,
    });

    return { gross: finalTotals.gross_amount, net: finalTotals.net_amount, totalEmployer: contrib.totalEmployer };
  }

  /**
   * Génère les lignes de commission interne d'un bulletin à partir des dossiers
   * clôturés sur la période, rattachés au collaborateur, selon un taux.
   * Le bulletin doit être en brouillon.
   */
  async generateCommissions(payslipId: number, ratePercent: number): Promise<PayslipLine[]> {
    const payslip = await this.payslipRepo.findOne({
      where: { id: payslipId },
      relations: ['period'],
    });
    if (!payslip) throw new NotFoundException('Fiche de paie non trouvée');
    if (payslip.status !== PayslipStatus.DRAFT) {
      throw new NotFoundException('Commissions générables uniquement sur un brouillon.');
    }

    // Dossiers du collaborateur ayant des honoraires, sur la période.
    const dossiers = await this.dossierRepo.find({
      where: { deleted_at: IsNull() } as any,
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
}
