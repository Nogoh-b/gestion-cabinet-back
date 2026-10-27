/**
 * Règles de calcul des crédits IA (fonctions pures, sans base de données).
 *
 * 1 crédit = `usd_per_credit` USD de coût fournisseur : les crédits d'un appel
 * valent `cost_usd / usd_per_credit`. Le forfait donne `ai_credits_per_month`
 * crédits par mois ; au-delà, on puise dans les crédits achetés (ledger).
 */

export const AI_CREDITS_SETTING_KEY = 'ai_credits_v1';
export const DEFAULT_USD_PER_CREDIT = 0.001;
export const AI_CREDITS_EXHAUSTED = 'AI_CREDITS_EXHAUSTED';

export interface AiCreditSettings {
  usd_per_credit: number;
}

/** Réglage stocké (JSON ou chaîne JSON) ; valeur invalide → défaut. */
export function parseCreditSettings(raw: unknown): AiCreditSettings {
  let value: any = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      value = null;
    }
  }
  const usd = Number(value?.usd_per_credit);
  return { usd_per_credit: Number.isFinite(usd) && usd > 0 ? usd : DEFAULT_USD_PER_CREDIT };
}

export function validateUsdPerCredit(value: unknown): number {
  const usd = Number(value);
  if (!Number.isFinite(usd) || usd <= 0 || usd > 100) {
    throw new Error('Le coût d’un crédit doit être un nombre positif en USD (par exemple 0,001).');
  }
  return Math.round(usd * 1e8) / 1e8;
}

const round4 = (value: number) => Math.round(value * 1e4) / 1e4;

/** Crédits correspondant à un coût fournisseur en USD. */
export function toCredits(costUsd: number | string | null | undefined, usdPerCredit: number): number {
  const cost = Number(costUsd ?? 0);
  if (!Number.isFinite(cost) || cost <= 0 || !(usdPerCredit > 0)) return 0;
  return round4(cost / usdPerCredit);
}

/** Coût fournisseur en USD d'un nombre de crédits (équivalent affiché à la plateforme). */
export function toUsd(credits: number, usdPerCredit: number): number {
  return Math.round(credits * usdPerCredit * 1e6) / 1e6;
}

/** NULL / -1 = illimité. */
export function isUnlimitedAllowance(allowance: number | null | undefined): boolean {
  return allowance === null || allowance === undefined || Number(allowance) === -1;
}

export interface CreditInput {
  /** Crédits du forfait par mois (NULL / -1 = illimité). */
  allowance: number | null | undefined;
  /** Crédits consommés ce mois. */
  used: number;
  /** Somme du ledger (achats + attributions − remboursements − dépassements des mois clos). */
  balance: number;
  /** Total des crédits achetés ou attribués (référence du pourcentage restant). */
  granted: number;
}

export interface CreditPosition {
  unlimited: boolean;
  allowance: number;
  used: number;
  /** Consommation du mois au-delà du forfait (puisée dans les crédits achetés). */
  overflow: number;
  /** Crédits achetés encore disponibles, dépassement du mois courant déduit. */
  extraLeft: number;
  granted: number;
  exhausted: boolean;
}

export function creditPosition(input: CreditInput): CreditPosition {
  const unlimited = isUnlimitedAllowance(input.allowance);
  const allowance = unlimited ? 0 : Math.max(0, Number(input.allowance));
  const used = Math.max(0, input.used);
  const overflow = unlimited ? 0 : Math.max(0, used - allowance);
  const extraLeft = Math.max(0, input.balance - overflow);
  return {
    unlimited,
    allowance,
    used,
    overflow,
    extraLeft: round4(extraLeft),
    granted: Math.max(0, input.granted),
    exhausted: !unlimited && allowance - used + input.balance <= 0,
  };
}

/** Ce que voit le cabinet : des pourcentages, jamais de crédits ni de montants. */
export interface AiCreditStatus {
  /** Part du forfait du mois consommée (0-100). */
  monthPct: number;
  /** Part des crédits achetés encore disponible (0-100) ; null si le cabinet n'en a jamais eu. */
  extraPct: number | null;
  exhausted: boolean;
  unlimited: boolean;
  /** Prochain mois : remise à zéro du forfait (ISO). */
  resetsAt: string;
}

export function publicStatus(position: CreditPosition, resetsAt: Date): AiCreditStatus {
  const { unlimited, allowance, used, extraLeft, granted, exhausted } = position;
  const monthPct = unlimited ? 0 : allowance > 0 ? Math.min(100, Math.floor((used / allowance) * 100)) : 100;
  const extraPct =
    unlimited || granted <= 0 ? null : Math.max(0, Math.min(100, Math.floor((extraLeft / granted) * 100)));
  return { monthPct, extraPct, exhausted, unlimited, resetsAt: resetsAt.toISOString() };
}

/** « 2026-10 » du mois de `date` (heure locale du serveur, comme le quota). */
export function periodOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function previousPeriod(now = new Date()): string {
  return periodOf(new Date(now.getFullYear(), now.getMonth() - 1, 1));
}

/** Bornes [début, fin[ d'un mois « AAAA-MM ». */
export function periodBounds(period: string): { start: Date; end: Date } {
  const match = /^(\d{4})-(\d{2})$/.exec(period);
  if (!match) throw new Error(`Période invalide : ${period}`);
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  return { start: new Date(year, month, 1), end: new Date(year, month + 1, 1) };
}

/** Dépassement à inscrire au ledger : jamais plus que les crédits achetés disponibles. */
export function overflowToCharge(overflow: number, balanceBefore: number): number {
  return round4(Math.min(Math.max(0, overflow), Math.max(0, balanceBefore)));
}

/** « ≈ +N % de votre forfait » d'un pack (null si forfait illimité ou sans crédits). */
export function packPlanPct(packCredits: number, allowance: number | null | undefined): number | null {
  if (isUnlimitedAllowance(allowance) || !(Number(allowance) > 0)) return null;
  return Math.max(1, Math.round((packCredits / Number(allowance)) * 100));
}

/**
 * Plan tel que le cabinet peut le voir : sans le nombre de crédits du forfait
 * (ni l'ancien quota de requêtes). Le cabinet n'a que des pourcentages.
 */
export function withoutCreditAllowance<T extends object | null | undefined>(plan: T): T {
  if (!plan) return plan;
  const { ai_credits_per_month, ai_requests_per_month, ...rest } = plan as Record<string, unknown>;
  void ai_credits_per_month;
  void ai_requests_per_month;
  return rest as T;
}
