import { Injectable } from '@nestjs/common';
import { PayslipLine, PayslipLineType } from '../entities/payslip-line.entity';
import {
  PayrollContribution,
  ContributionBase,
  ContributionPayer,
} from '../entities/payroll-contribution.entity';

/** Une retenue salariale prête à devenir une ligne de bulletin. */
export interface ComputedEmployeeDeduction {
  code: string;
  label: string;
  amount: number;
  account_number: string | null;
}

/** Une charge patronale (hors net, pour la comptabilité). */
export interface ComputedEmployerCharge {
  code: string;
  label: string;
  amount: number;
  account_number: string | null;
}

export interface ComputedContributions {
  employeeDeductions: ComputedEmployeeDeduction[];
  employerCharges: ComputedEmployerCharge[];
  totalEmployee: number;
  totalEmployer: number;
}

/**
 * Résultat du calcul d'un bulletin à partir de ses lignes.
 * Tous les montants sont en valeur absolue positive (les retenues sont
 * comptées séparément, jamais en montant négatif).
 */
export interface PayslipTotals {
  /** Somme des gains : salaire de base + primes + commissions + avantages + heures sup. */
  gross_amount: number;
  /** Somme des retenues (cotisations, avances, etc.). */
  total_deductions: number;
  /** Net à payer = brut - retenues. */
  net_amount: number;
  /** Sous-total des commissions internes (dossiers). */
  total_commissions: number;
  /** Base imposable : gains marqués imposables uniquement. */
  taxable_base: number;
}

/**
 * Service de calcul pur (sans accès base de données).
 *
 * Centralise TOUTE l'arithmétique de paie pour que le brut / net / retenues
 * dérivent systématiquement des lignes du bulletin, et ne soient plus saisis
 * à la main de façon incohérente.
 */
@Injectable()
export class PayrollCalculatorService {
  /** Types de ligne considérés comme des gains (ajoutés au brut). */
  private static readonly EARNING_TYPES: PayslipLineType[] = [
    PayslipLineType.BASE_SALARY,
    PayslipLineType.BONUS,
    PayslipLineType.INTERNAL_COMMISSION,
    PayslipLineType.BENEFIT,
    PayslipLineType.OVERTIME,
  ];

  /** Arrondi monétaire à 2 décimales, robuste aux erreurs de flottant. */
  static round(n: number): number {
    return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  }

  private isEarning(line: { line_type: PayslipLineType }): boolean {
    return PayrollCalculatorService.EARNING_TYPES.includes(line.line_type);
  }

  /**
   * Calcule les totaux d'un bulletin à partir de ses lignes.
   * Une ligne sans `amount` valide est traitée comme 0.
   */
  computeTotals(lines: Array<Pick<PayslipLine, 'line_type' | 'amount' | 'is_taxable'>>): PayslipTotals {
    const safe = (v: any) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    };

    let gross = 0;
    let deductions = 0;
    let commissions = 0;
    let taxable = 0;

    for (const line of lines ?? []) {
      const amount = Math.abs(safe(line.amount));
      if (this.isEarning(line)) {
        gross += amount;
        if (line.is_taxable) taxable += amount;
        if (line.line_type === PayslipLineType.INTERNAL_COMMISSION) commissions += amount;
      } else if (line.line_type === PayslipLineType.DEDUCTION) {
        deductions += amount;
      }
    }

    const round = PayrollCalculatorService.round;
    return {
      gross_amount: round(gross),
      total_deductions: round(deductions),
      net_amount: round(gross - deductions),
      total_commissions: round(commissions),
      taxable_base: round(taxable),
    };
  }

  /**
   * Applique un barème de cotisations à un bulletin déjà chiffré (brut + base
   * imposable connus) et produit les retenues salariales et charges patronales.
   *
   * Calcul pur : ne touche pas la base de données, ne crée pas de lignes.
   * L'assiette est plafonnée si la cotisation définit un `ceiling`.
   */
  computeContributions(
    totals: Pick<PayslipTotals, 'gross_amount' | 'taxable_base'>,
    contributions: PayrollContribution[],
  ): ComputedContributions {
    const round = PayrollCalculatorService.round;
    const employeeDeductions: ComputedEmployeeDeduction[] = [];
    const employerCharges: ComputedEmployerCharge[] = [];

    const sorted = [...(contributions ?? [])]
      .filter((c) => c.is_active)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

    for (const c of sorted) {
      let base: number;
      switch (c.base_type) {
        case ContributionBase.TAXABLE:
          base = totals.taxable_base;
          break;
        case ContributionBase.FIXED:
          base = 0; // montant fixe : l'assiette est ignorée
          break;
        case ContributionBase.GROSS:
        default:
          base = totals.gross_amount;
          break;
      }

      if (c.ceiling != null && base > Number(c.ceiling)) {
        base = Number(c.ceiling);
      }

      const amount =
        c.base_type === ContributionBase.FIXED
          ? round(Number(c.rate))
          : round((base * Number(c.rate)) / 100);

      if (amount <= 0) continue;

      const entry = {
        code: c.code,
        label: c.label,
        amount,
        account_number: c.account_number ?? null,
      };

      if (c.payer === ContributionPayer.EMPLOYEE) {
        employeeDeductions.push(entry);
      } else {
        employerCharges.push(entry);
      }
    }

    return {
      employeeDeductions,
      employerCharges,
      totalEmployee: round(employeeDeductions.reduce((s, e) => s + e.amount, 0)),
      totalEmployer: round(employerCharges.reduce((s, e) => s + e.amount, 0)),
    };
  }
}
