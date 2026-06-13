import { describe, it, expect, beforeEach } from '@jest/globals';
import { PayrollCalculatorService } from './payroll-calculator.service';
import { PayslipLineType } from '../entities/payslip-line.entity';
import {
  PayrollContribution,
  ContributionBase,
  ContributionPayer,
} from '../entities/payroll-contribution.entity';

const line = (line_type: PayslipLineType, amount: number, is_taxable = true) =>
  ({ line_type, amount, is_taxable }) as any;

const contrib = (over: Partial<PayrollContribution>): PayrollContribution =>
  ({
    code: 'X',
    label: 'X',
    rate: 0,
    base_type: ContributionBase.GROSS,
    payer: ContributionPayer.EMPLOYEE,
    ceiling: null,
    account_number: null,
    is_active: true,
    sort_order: 1,
    ...over,
  }) as PayrollContribution;

describe('PayrollCalculatorService', () => {
  let calc: PayrollCalculatorService;

  beforeEach(() => {
    calc = new PayrollCalculatorService();
  });

  describe('computeTotals', () => {
    it('somme les gains et soustrait les retenues', () => {
      const totals = calc.computeTotals([
        line(PayslipLineType.BASE_SALARY, 500000),
        line(PayslipLineType.BONUS, 50000),
        line(PayslipLineType.DEDUCTION, 30000),
      ]);
      expect(totals.gross_amount).toBe(550000);
      expect(totals.total_deductions).toBe(30000);
      expect(totals.net_amount).toBe(520000);
    });

    it('compte les commissions internes et la base imposable', () => {
      const totals = calc.computeTotals([
        line(PayslipLineType.BASE_SALARY, 400000, true),
        line(PayslipLineType.INTERNAL_COMMISSION, 100000, true),
        line(PayslipLineType.BENEFIT, 20000, false), // non imposable
      ]);
      expect(totals.gross_amount).toBe(520000);
      expect(totals.total_commissions).toBe(100000);
      expect(totals.taxable_base).toBe(500000);
    });

    it('traite les montants négatifs en valeur absolue et ignore les NaN', () => {
      const totals = calc.computeTotals([
        line(PayslipLineType.BASE_SALARY, -300000),
        line(PayslipLineType.DEDUCTION, NaN),
      ]);
      expect(totals.gross_amount).toBe(300000);
      expect(totals.total_deductions).toBe(0);
    });

    it('renvoie des zéros sans lignes', () => {
      const totals = calc.computeTotals([]);
      expect(totals).toEqual({
        gross_amount: 0,
        total_deductions: 0,
        net_amount: 0,
        total_commissions: 0,
        taxable_base: 0,
      });
    });
  });

  describe('computeContributions', () => {
    it('calcule une retenue salariale en pourcentage du brut', () => {
      const res = calc.computeContributions(
        { gross_amount: 500000, taxable_base: 500000 },
        [contrib({ code: 'CNPS', rate: 4.2, payer: ContributionPayer.EMPLOYEE })],
      );
      expect(res.employeeDeductions).toHaveLength(1);
      expect(res.employeeDeductions[0].amount).toBe(21000);
      expect(res.totalEmployee).toBe(21000);
      expect(res.totalEmployer).toBe(0);
    });

    it('applique le plafond d\'assiette', () => {
      const res = calc.computeContributions(
        { gross_amount: 1000000, taxable_base: 1000000 },
        [contrib({ rate: 4.2, ceiling: 750000, payer: ContributionPayer.EMPLOYEE })],
      );
      // 750000 * 4,2% = 31500
      expect(res.employeeDeductions[0].amount).toBe(31500);
    });

    it('sépare part salariale et part patronale, et gère le montant fixe', () => {
      const res = calc.computeContributions(
        { gross_amount: 500000, taxable_base: 500000 },
        [
          contrib({ code: 'SAL', rate: 4.2, payer: ContributionPayer.EMPLOYEE }),
          contrib({ code: 'PAT', rate: 7, payer: ContributionPayer.EMPLOYER }),
          contrib({ code: 'FIX', rate: 1300, base_type: ContributionBase.FIXED, payer: ContributionPayer.EMPLOYEE }),
        ],
      );
      expect(res.totalEmployee).toBe(21000 + 1300);
      expect(res.totalEmployer).toBe(35000);
    });

    it('ignore les cotisations inactives', () => {
      const res = calc.computeContributions(
        { gross_amount: 500000, taxable_base: 500000 },
        [contrib({ rate: 4.2, is_active: false })],
      );
      expect(res.employeeDeductions).toHaveLength(0);
    });
  });
});
