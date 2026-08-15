import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import {
  InitiatePaymentInput,
  InitiatePaymentResult,
  PaymentProvider,
  ProviderPaymentStatus,
} from './payment-provider.interface';

/**
 * Passerelle de TEST (aucun encaissement réel).
 *
 * `initiate` retourne une référence + une URL de paiement pointant vers le
 * front (`/abonnement?payment_ref=…`), où un bouton « Payer (test) » déclenche
 * la confirmation via l'endpoint de simulation. `verify` considère toute
 * transaction comme payable.
 *
 * Sélectionnée par défaut (PAYMENT_PROVIDER) tant qu'aucune vraie passerelle
 * n'est configurée.
 */
@Injectable()
export class TestPaymentProvider implements PaymentProvider {
  readonly name = 'test';
  private readonly logger = new Logger(TestPaymentProvider.name);

  async initiate(input: InitiatePaymentInput): Promise<InitiatePaymentResult> {
    const reference = `TEST-${input.paymentId}-${randomBytes(4).toString('hex')}`;
    const base = (process.env.APP_FRONTEND_URL ?? '').replace(/\/+$/, '');
    const checkoutUrl = `${base}/abonnement?payment_ref=${encodeURIComponent(reference)}`;
    this.logger.log(
      `[TEST] Paiement initié — payment=${input.paymentId} ` +
        `montant=${input.amount} ${input.currency} ref=${reference}`,
    );
    return { reference, checkoutUrl };
  }

  async verify(reference: string): Promise<ProviderPaymentStatus> {
    this.logger.log(`[TEST] Vérification ${reference} → paid`);
    return 'paid';
  }
}
