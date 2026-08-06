/**
 * Abstraction d'une passerelle de paiement.
 *
 * Permet de brancher une vraie passerelle (CinetPay, Stripe, mobile money…)
 * plus tard sans toucher au service d'abonnement : il suffit de fournir une
 * autre implémentation sous le token PAYMENT_PROVIDER.
 */

export interface InitiatePaymentInput {
  paymentId: number;
  amount: number;
  currency: string;
  cabinetId: number;
}

export interface InitiatePaymentResult {
  /** Référence de transaction (rapprochement via le webhook). */
  reference: string;
  /** URL de la page de paiement à présenter au client. */
  checkoutUrl: string;
}

export type ProviderPaymentStatus = 'paid' | 'pending' | 'failed';

export interface PaymentProvider {
  /** Identifiant court de la passerelle (ex: 'test', 'cinetpay', 'stripe'). */
  readonly name: string;
  /** Crée une session de paiement et retourne la référence + l'URL de paiement. */
  initiate(input: InitiatePaymentInput): Promise<InitiatePaymentResult>;
  /** Vérifie l'état d'une transaction auprès de la passerelle. */
  verify(reference: string): Promise<ProviderPaymentStatus>;
}

/** Token DI de la passerelle active. */
export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');
