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

/**
 * Décompte multi-créances (plusieurs factures ou échéances) avec acomptes
 * globaux : à chaque acompte comme à la date d'arrêté, seules les créances
 * déjà échues produisent des intérêts ; l'acompte s'impute d'abord sur les
 * intérêts échus (du plus ancien au plus récent), puis sur le capital échu
 * le plus ancien (art. 1254 / 1256 C. civ.).
 */
export interface MultiClaimItem {
  label: string;
  principal: number;
  from: Date;
}

export interface MultiClaimInput {
  items: MultiClaimItem[];
  rate: number;
  to: Date;
  basis?: 365 | 360;
  fees?: Array<{ label: string; amount: number }>;
  payments?: Array<{ date: Date; amount: number; label?: string }>;
}

export interface MultiClaimRow {
  label: string;
  principal: number;
  from: Date;
  interestTotal: number;
  interestDue: number;
  capitalDue: number;
  paymentsApplied: number;
  due: number;
}

export interface MultiClaimResult extends ClaimResult {
  rows: MultiClaimRow[];
  principalTotal: number;
}

export function computeMultiClaim(input: MultiClaimInput): MultiClaimResult {
  const basis = input.basis ?? 365;
  const rate = Math.max(0, input.rate) / 100;
  const items = input.items
    .filter((item) => item.principal > 0)
    .map((item, idx) => ({
      idx,
      label: item.label || `Créance ${idx + 1}`,
      principal: round(item.principal),
      capital: round(item.principal),
      from: item.from,
      cursor: item.from,
      accrued: 0,
      interestTotal: 0,
      paymentsApplied: 0,
    }))
    .sort((a, b) => a.from.getTime() - b.from.getTime() || a.idx - b.idx);

  const periods: ClaimPeriod[] = [];
  const imputations: ClaimResult['imputations'] = [];
  const payments = (input.payments ?? [])
    .filter((payment) => payment.amount > 0 && payment.date <= input.to)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  const accrue = (until: Date) => {
    for (const item of items) {
      if (until <= item.cursor || item.capital <= 0) continue;
      const days = dayDiff(item.cursor, until);
      const interest = round((item.capital * rate * days) / basis);
      if (days > 0) periods.push({ from: item.cursor, to: until, days, capital: round(item.capital), interest });
      item.accrued = round(item.accrued + interest);
      item.interestTotal = round(item.interestTotal + interest);
      item.cursor = until;
    }
  };

  for (const payment of payments) {
    accrue(payment.date);
    let remaining = payment.amount;
    let onInterest = 0;
    let onCapital = 0;
    const eligible = items.filter((item) => item.from <= payment.date);
    const pool = eligible.length ? eligible : items;
    for (const item of pool) {
      if (remaining <= 0) break;
      const take = Math.min(item.accrued, remaining);
      if (take > 0) {
        item.accrued = round(item.accrued - take);
        item.paymentsApplied = round(item.paymentsApplied + take);
        onInterest = round(onInterest + take);
        remaining = round(remaining - take);
      }
    }
    for (const item of pool) {
      if (remaining <= 0) break;
      const take = Math.min(item.capital, remaining);
      if (take > 0) {
        item.capital = round(item.capital - take);
        item.paymentsApplied = round(item.paymentsApplied + take);
        onCapital = round(onCapital + take);
        remaining = round(remaining - take);
      }
    }
    imputations.push({
      date: payment.date,
      amount: payment.amount,
      onInterest,
      onCapital,
      label: payment.label,
    });
  }
  accrue(input.to);

  const ordered = [...items].sort((a, b) => a.idx - b.idx);
  const rows: MultiClaimRow[] = ordered.map((item) => ({
    label: item.label,
    principal: item.principal,
    from: item.from,
    interestTotal: item.interestTotal,
    interestDue: item.accrued,
    capitalDue: item.capital,
    paymentsApplied: item.paymentsApplied,
    due: round(item.capital + item.accrued),
  }));
  const principalTotal = round(rows.reduce((sum, r) => sum + r.principal, 0));
  const interestTotal = round(rows.reduce((sum, r) => sum + r.interestTotal, 0));
  const interestDue = round(rows.reduce((sum, r) => sum + r.interestDue, 0));
  const capitalDue = round(rows.reduce((sum, r) => sum + r.capitalDue, 0));
  const feesTotal = round((input.fees ?? []).reduce((sum, fee) => sum + Math.max(0, fee.amount), 0));
  const paymentsTotal = round(payments.reduce((sum, payment) => sum + payment.amount, 0));
  return {
    rows,
    periods,
    imputations,
    principalTotal,
    interestTotal,
    interestDue,
    capitalDue,
    feesTotal,
    paymentsTotal,
    total: round(capitalDue + interestDue + feesTotal),
  };
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
