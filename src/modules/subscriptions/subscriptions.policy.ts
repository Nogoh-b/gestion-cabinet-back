import { Plan } from 'src/modules/plans/entities/plan.entity';
import { BillingCycle } from './entities/subscription.entity';

/**
 * Politique d'attribution de la date de fin d'abonnement (décompte).
 *
 * Configurable via la variable d'environnement `SUBSCRIPTION_TRIAL_POLICY` :
 *
 *   - `trial_first`    (défaut) : toute nouvelle souscription démarre par une
 *                       période d'essai gratuite de `SUBSCRIPTION_TRIAL_DAYS`
 *                       jours (is_trial = true). À l'échéance, le cycle
 *                       mensuel/annuel prend le relais.
 *   - `free_unlimited` : le plan gratuit (price_monthly = 0) n'a PAS de date de
 *                       fin (illimité). Les plans payants ont une date de fin
 *                       calculée selon le cycle.
 *   - `always_period`  : tous les plans (gratuit inclus) ont une date de fin =
 *                       début + 1 mois / 1 an selon le cycle.
 *
 * Pour BASCULER : modifier `SUBSCRIPTION_TRIAL_POLICY` dans le `.env` puis
 * redémarrer le backend. `SUBSCRIPTION_TRIAL_DAYS` ajuste la durée d'essai.
 */
export type TrialPolicy = 'trial_first' | 'free_unlimited' | 'always_period';

const VALID_POLICIES: TrialPolicy[] = [
  'trial_first',
  'free_unlimited',
  'always_period',
];

export function getTrialPolicy(): TrialPolicy {
  const raw = (process.env.SUBSCRIPTION_TRIAL_POLICY ?? 'trial_first').trim() as TrialPolicy;
  return VALID_POLICIES.includes(raw) ? raw : 'trial_first';
}

export function getTrialDays(): number {
  const n = parseInt(process.env.SUBSCRIPTION_TRIAL_DAYS ?? '30', 10);
  return Number.isFinite(n) && n > 0 ? n : 30;
}

// ── Helpers de dates ──────────────────────────────────────────────────────────

export function addDays(from: Date, days: number): Date {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return d;
}

export function addMonths(from: Date, months: number): Date {
  const d = new Date(from);
  d.setMonth(d.getMonth() + months);
  return d;
}

/** Avance d'une période complète selon le cycle (1 mois ou 1 an). */
export function addCycle(from: Date, cycle: BillingCycle): Date {
  return cycle === 'yearly' ? addMonths(from, 12) : addMonths(from, 1);
}

// ── Résolution de la période initiale ──────────────────────────────────────────

export interface PeriodResolution {
  ends_at: Date | null;
  is_trial: boolean;
  /** Montant dû pour la période (0 si essai ou plan gratuit). */
  amount: number;
}

export function planPriceForCycle(plan: Plan | null, cycle: BillingCycle): number {
  if (!plan) return 0;
  if (cycle === 'yearly') {
    return Number(plan.price_yearly ?? 0) || 0;
  }
  return Number(plan.price_monthly ?? 0) || 0;
}

export function isFreePlan(plan: Plan | null): boolean {
  return !plan || Number(plan.price_monthly ?? 0) === 0;
}

/**
 * Calcule la fin de la première période d'un abonnement selon la politique
 * active. `startedAt` par défaut = maintenant.
 */
export function resolveInitialPeriod(
  plan: Plan | null,
  cycle: BillingCycle,
  startedAt: Date = new Date(),
): PeriodResolution {
  const policy = getTrialPolicy();

  if (policy === 'trial_first') {
    return {
      ends_at: addDays(startedAt, getTrialDays()),
      is_trial: true,
      amount: 0,
    };
  }

  if (policy === 'free_unlimited' && isFreePlan(plan)) {
    return { ends_at: null, is_trial: false, amount: 0 };
  }

  // always_period, ou free_unlimited avec un plan payant
  return {
    ends_at: addCycle(startedAt, cycle),
    is_trial: false,
    amount: planPriceForCycle(plan, cycle),
  };
}

/**
 * Calcule la période de renouvellement (après expiration d'un essai ou d'une
 * période payante). Le renouvellement n'est jamais un essai.
 */
export function resolveRenewalPeriod(
  plan: Plan | null,
  cycle: BillingCycle,
  startedAt: Date = new Date(),
): PeriodResolution {
  const policy = getTrialPolicy();

  if (policy === 'free_unlimited' && isFreePlan(plan)) {
    return { ends_at: null, is_trial: false, amount: 0 };
  }

  return {
    ends_at: addCycle(startedAt, cycle),
    is_trial: false,
    amount: planPriceForCycle(plan, cycle),
  };
}

/** Nombre de jours restants avant `ends_at` (arrondi au supérieur). null = illimité. */
export function daysRemaining(endsAt: Date | null, now: Date = new Date()): number | null {
  if (!endsAt) return null;
  const ms = new Date(endsAt).getTime() - now.getTime();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}
