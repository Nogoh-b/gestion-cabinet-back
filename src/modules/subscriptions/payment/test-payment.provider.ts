import { Injectable, Logger } from '@nestjs/common';
import {
  InitiatePaymentInput,
  InitiatePaymentResult,
  ParsedWebhook,
  PaymentProvider,
  ProviderContext,
  VerifyPaymentInput,
  VerifyPaymentResult,
  WebhookRequest,
} from './payment-provider.interface';
import { frontendPublicUrl } from './payment-methods.service';

/**
 * Passerelle de TEST (aucun encaissement réel), disponible uniquement hors
 * production (`isPaymentTestEnabled`).
 *
 * `initiate` renvoie une URL vers le front (`/abonnement?payment_ref=…`) où
 * un bouton « Payer (test) » déclenche la simulation.
 */
@Injectable()
export class TestPaymentProvider implements PaymentProvider {
  readonly name = 'test' as const;
  private readonly logger = new Logger(TestPaymentProvider.name);

  async initiate(input: InitiatePaymentInput): Promise<InitiatePaymentResult> {
    const base = frontendPublicUrl();
    const checkoutUrl = `${base}/abonnement?payment_ref=${encodeURIComponent(input.reference)}`;
    this.logger.log(
      `[TEST] Paiement initié — payment=${input.paymentId} montant=${input.amount} ${input.currency} ref=${input.reference}`,
    );
    return { reference: input.reference, checkoutUrl };
  }

  async verify(_input: VerifyPaymentInput): Promise<VerifyPaymentResult> {
    // La passerelle de test ne confirme jamais d'elle-même : seule la
    // simulation explicite (/subscriptions/payments/simulate) encaisse.
    return { status: 'pending' };
  }

  async parseWebhook(req: WebhookRequest, _ctx: ProviderContext): Promise<ParsedWebhook> {
    return {
      signatureValid: false,
      eventId: `test-${Date.now()}`,
      reference: req.body?.reference ?? null,
      ignore: true,
      raw: req.body ?? {},
    };
  }

  async testConnection() {
    return { ok: true, message: 'Passerelle de test (aucun encaissement réel).' };
  }
}
