// src/modules/ai-skills/claim-calculator.ts

/**
 * Décompte d'une créance arrêté à une date : intérêts simples au taux annuel
 * indiqué (légal ou conventionnel, jamais deviné), frais et acomptes.
 * Les acomptes s'imputent d'abord sur les intérêts échus, puis sur le capital
 * (règle d'imputation des paiements du droit civil, art. 1254 C. civ.).
 */

export interface ClaimInput {
  principal: number;
  /** Taux annuel en pourcentage (ex. 3,5) ; 0 = sans intérêts. */
  rate: number;
  /** Point de départ des intérêts (mise en demeure, échéance…). */
  from: Date;
  /** Date d'arrêté du décompte. */
  to: Date;
  /** Base de calcul : 365 jours (défaut) ou 360. */
  basis?: 365 | 360;
  fees?: Array<{ label: string; amount: number }>;
  payments?: Array<{ date: Date; amount: number; label?: string }>;
}

export interface ClaimPeriod {
  from: Date;
  to: Date;
  days: number;
  capital: number;
  interest: number;
}

export interface ClaimResult {
  periods: ClaimPeriod[];
  imputations: Array<{ date: Date; amount: number; onInterest: number; onCapital: number; label?: string }>;
  interestTotal: number;
  interestDue: number;
  capitalDue: number;
  feesTotal: number;
  paymentsTotal: number;
  total: number;
}

const round = (value: number) => Math.round(value * 100) / 100;
const dayDiff = (a: Date, b: Date) =>
  Math.max(0, Math.round((new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime() - new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime()) / 86_400_000));

export function computeClaim(input: ClaimInput): ClaimResult {
  const basis = input.basis ?? 365;
  const rate = Math.max(0, input.rate) / 100;
  let capital = Math.max(0, input.principal);
  let accrued = 0;
  let interestTotal = 0;
  const periods: ClaimPeriod[] = [];
  const imputations: ClaimResult['imputations'] = [];

  const payments = (input.payments ?? [])
    .filter((payment) => payment.amount > 0 && payment.date <= input.to)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  let cursor = input.from;
  const accrue = (until: Date) => {
    if (until <= cursor) return;
    const days = dayDiff(cursor, until);
    const interest = round((capital * rate * days) / basis);
    if (days > 0) periods.push({ from: cursor, to: until, days, capital: round(capital), interest });
    accrued += interest;
    interestTotal += interest;
    cursor = until;
  };

  for (const payment of payments) {
    if (payment.date > input.from) accrue(payment.date);
    const onInterest = Math.min(accrued, payment.amount);
    accrued -= onInterest;
    const onCapital = Math.min(capital, payment.amount - onInterest);
    capital -= onCapital;
    imputations.push({ date: payment.date, amount: payment.amount, onInterest: round(onInterest), onCapital: round(onCapital), label: payment.label });
  }
  accrue(input.to);

  const feesTotal = round((input.fees ?? []).reduce((sum, fee) => sum + Math.max(0, fee.amount), 0));
  const paymentsTotal = round(payments.reduce((sum, payment) => sum + payment.amount, 0));
  return {
    periods,
    imputations,
    interestTotal: round(interestTotal),
    interestDue: round(accrued),
    capitalDue: round(capital),
    feesTotal,
    paymentsTotal,
    total: round(capital + accrued + feesTotal),
  };
}

/** « 1 250 000 FCFA » ; décimales seulement si nécessaires. */
export function fcfa(value: number): string {
  return `${Number(value ?? 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} FCFA`;
}

/** « 1 500 000 FCFA », « 1.500.000 », « 1 500 000,50 » → nombre ; NaN si illisible. */
export function parseAmount(value: unknown): number {
  if (typeof value === 'number') return value;
  const text = String(value ?? '').replace(/[^\d,.\-]/g, '');
  if (!text) return NaN;
  // « 1.500.000 » (séparateurs de milliers) vs « 1500,50 » (décimales).
  const normalized = /^\d{1,3}([.,]\d{3})+$/.test(text) ? text.replace(/[.,]/g, '') : text.replace(',', '.');
  return Number(normalized);
}
