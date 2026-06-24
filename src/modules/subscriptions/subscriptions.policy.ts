import { Plan } from 'src/modules/plans/entities/plan.entity';
import { BillingCycle } from './entities/subscription.entity';

/**
 * Politique d'essai configurable par plan.
 *
 * Chaque plan définit sa propre politique via 3 champs :
 *   - trial_enabled   : l'essai est-il activé pour ce plan ?
 *   - trial_days      : durée de l'essai en jours (si trial_enabled)
 *   - min_commitment_months : mois d'engagement après l'essai
 *
 * Règles :
 *   - L'essai n'est accordé que si trial_enabled=true ET le plan est payant
 *     (price_monthly > 0). Les plans gratuits n'ont pas d'essai.
 *   - À l'initialisation : is_trial=true, ends_at=now+trial_days, amount=0
 *   - Au renouvellement : si min_commitment_months>0, la période est forcée
 *     à X mois. Sinon, cycle standard (1 mois ou 1 an selon billing_cycle).
 */

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
  /** Fin de la portion d'essai (null = pas d'essai). */
  trial_ends_at: Date | null;
  is_trial: boolean;
  /** Montant dû pour la période (0 si essai ou plan gratuit). */
  amount: number;
}

/** Vrai si le plan ouvre droit à un essai (activé, durée > 0, et plan payant). */
export function hasTrial(plan: Plan | null): boolean {
  return (
    !!plan &&
    !isFreePlan(plan) &&
    !!plan.trial_enabled &&
    Number(plan.trial_days ?? 0) > 0
  );
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
 * Calcule la fin de la première période d'un abonnement selon la configuration
 * du plan (essai configurable). `startedAt` par défaut = maintenant.
 *
 * Règles :
 *   - Si plan.trial_enabled=true ET plan payant → essai gratuit de trial_days jours
 *     suivi d'une période payante (empilé) : ends_at = now + trial_days + cycle
 *   - Sinon → période payante directe calculée selon le cycle
 */
export function resolveInitialPeriod(
  plan: Plan | null,
  cycle: BillingCycle,
  startedAt: Date = new Date(),
): PeriodResolution {
  // Pas d'essai si plan inexistant, gratuit, trial désactivé OU trial_days <= 0.
  if (!hasTrial(plan)) {
    return {
      ends_at: addCycle(startedAt, cycle),
      trial_ends_at: null,
      is_trial: false,
      amount: planPriceForCycle(plan, cycle),
    };
  }

  // Essai activé sur plan payant → empiler : essai + période payante.
  // trial_ends_at borne l'essai ; ends_at = fin de la période payante qui suit.
  const trialEnd = addDays(startedAt, plan!.trial_days);
  const paidEnd = addCycle(trialEnd, cycle);

  return {
    ends_at: paidEnd,
    trial_ends_at: trialEnd,
    is_trial: true,
    amount: planPriceForCycle(plan, cycle),
  };
}

/**
 * Calcule la période de renouvellement (après expiration d'un essai ou d'une
 * période payante). Le renouvellement n'est jamais un essai.
 *
 * Règles :
 *   - Plan gratuit → illimité (ends_at=null)
 *   - Si min_commitment_months > 0 → période forcée à X mois
 *   - Sinon → cycle standard (1 mois ou 1 an selon billing_cycle)
 */
export function resolveRenewalPeriod(
  plan: Plan | null,
  cycle: BillingCycle,
  startedAt: Date = new Date(),
): PeriodResolution {
  // Plan gratuit = illimité
  if (isFreePlan(plan)) {
    return { ends_at: null, trial_ends_at: null, is_trial: false, amount: 0 };
  }

  // Engagement : durée forcée si min_commitment_months > 0
  if (plan?.min_commitment_months && plan.min_commitment_months > 0) {
    return {
      ends_at: addMonths(startedAt, plan.min_commitment_months),
      trial_ends_at: null,
      is_trial: false,
      amount: planPriceForCycle(plan, cycle),
    };
  }

  // Cycle standard (1 mois ou 1 an)
  return {
    ends_at: addCycle(startedAt, cycle),
    trial_ends_at: null,
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
