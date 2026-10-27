/**
 * Contrat d'une passerelle de paiement des abonnements.
 *
 * Chaque passerelle (CinetPay, NotchPay, Stripe, test) reçoit sa configuration
 * à chaque appel (`ProviderContext`, issue de `platform_payment_methods`,
 * secrets déchiffrés) : plusieurs comptes/modes peuvent coexister et la
 * plateforme peut changer les clés sans redémarrage.
 *
 * Règle de sécurité : une notification (webhook) n'est JAMAIS crue sur
 * parole. Sa signature est vérifiée (`parseWebhook`) puis le statut est
 * toujours relu auprès de la passerelle (`verify`) avant confirmation.
 */
import type {
  PaymentMode,
  PaymentProviderCode,
} from './entities/payment-method.entity';

export interface ProviderContext {
  methodCode: string;
  mode: PaymentMode;
  /** Secrets déchiffrés (clés API, secret de webhook…). */
  secrets: Record<string, string>;
  /** Configuration publique (canaux, libellés…). */
  publicConfig: Record<string, any>;
}

export interface InitiatePaymentInput {
  paymentId: number;
  cabinetId: number;
  amount: number;
  currency: string;
  /** Notre référence de transaction (unique par tentative). */
  reference: string;
  description: string;
  customer: { email: string | null; name: string | null; phone: string | null };
  /** Retour navigateur après paiement (route API qui redirige vers le front). */
  returnUrl: string;
  cancelUrl: string;
  /** URL de notification serveur (webhook). */
  notifyUrl: string;
}

export interface InitiatePaymentResult {
  /** Référence de rapprochement (la nôtre ou celle de la passerelle). */
  reference: string;
  /** URL de la page de paiement à présenter au client. */
  checkoutUrl: string;
  /** Identifiant propre à la passerelle (session Stripe, référence NotchPay…). */
  providerReference?: string | null;
  raw?: Record<string, any>;
}

export type ProviderPaymentStatus = 'paid' | 'pending' | 'failed';

export interface VerifyPaymentInput {
  reference: string;
  providerReference?: string | null;
}

export interface VerifyPaymentResult {
  status: ProviderPaymentStatus;
  amount?: number | null;
  currency?: string | null;
  /** Canal réellement utilisé (ex. MTN, ORANGE, card). */
  channel?: string | null;
  failureReason?: string | null;
  raw?: Record<string, any>;
}

export interface WebhookRequest {
  headers: Record<string, string | string[] | undefined>;
  rawBody: Buffer | null;
  body: any;
}

export interface ParsedWebhook {
  /** Signature présente et valide (ou non configurée et non exigée). */
  signatureValid: boolean;
  /** Identifiant unique de l'événement (anti-rejeu). */
  eventId: string;
  /** Référence permettant de retrouver l'échéance. */
  reference: string | null;
  providerReference?: string | null;
  /** Événement à ignorer (ping, type non géré…). */
  ignore?: boolean;
  raw: Record<string, any>;
}

export interface PaymentProvider {
  readonly name: PaymentProviderCode;
  initiate(input: InitiatePaymentInput, ctx: ProviderContext): Promise<InitiatePaymentResult>;
  verify(input: VerifyPaymentInput, ctx: ProviderContext): Promise<VerifyPaymentResult>;
  parseWebhook(req: WebhookRequest, ctx: ProviderContext): Promise<ParsedWebhook>;
  /** Vérifie que les clés sont valides (appel léger à l'API). */
  testConnection(ctx: ProviderContext): Promise<{ ok: boolean; message: string }>;
  /** Remboursement via l'API de la passerelle (optionnel). */
  refund?(
    input: { reference: string; providerReference?: string | null; amount: number; currency: string; payload?: any },
    ctx: ProviderContext,
  ): Promise<{ ok: boolean; message: string; raw?: any }>;
}

/** Devises sans décimales (montant transmis tel quel aux passerelles). */
export const ZERO_DECIMAL_CURRENCIES = new Set([
  'XAF', 'XOF', 'JPY', 'KRW', 'CLP', 'GNF', 'KMF', 'MGA', 'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XPF', 'BIF', 'DJF',
]);

export function headerValue(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | null {
  const key = Object.keys(headers ?? {}).find((k) => k.toLowerCase() === name.toLowerCase());
  const value = key ? headers[key] : undefined;
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}
