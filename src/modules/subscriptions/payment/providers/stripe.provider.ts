import { BadGatewayException, Injectable } from '@nestjs/common';
import {
  InitiatePaymentInput,
  InitiatePaymentResult,
  ParsedWebhook,
  PaymentProvider,
  ProviderContext,
  VerifyPaymentInput,
  VerifyPaymentResult,
  WebhookRequest,
  ZERO_DECIMAL_CURRENCIES,
  headerValue,
} from '../payment-provider.interface';
import {
  hmacSha256Hex,
  providerFetch,
  requireSecrets,
  safeEqualStrings,
} from './provider-http';

const BASE_URL = 'https://api.stripe.com/v1';
const SIGNATURE_TOLERANCE_S = 300;
const HANDLED_EVENTS = new Set([
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'checkout.session.expired',
]);

export function toMinorUnits(amount: number, currency: string): number {
  return ZERO_DECIMAL_CURRENCIES.has(currency.toUpperCase())
    ? Math.round(amount)
    : Math.round(amount * 100);
}

export function fromMinorUnits(amount: number, currency: string): number {
  return ZERO_DECIMAL_CURRENCIES.has(currency.toUpperCase()) ? amount : amount / 100;
}

/**
 * Vérifie l'en-tête `Stripe-Signature` (t=…,v1=…) : HMAC-SHA256 de
 * `${t}.${corps brut}` avec le secret de webhook, horodatage récent.
 */
export function verifyStripeSignature(
  header: string | null,
  rawBody: Buffer | null,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  if (!header || !rawBody || !secret) return false;
  const parts = header.split(',').map((p) => p.trim().split('='));
  const timestamp = Number(parts.find(([k]) => k === 't')?.[1]);
  const signatures = parts.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!timestamp || !signatures.length) return false;
  if (Math.abs(nowSeconds - timestamp) > SIGNATURE_TOLERANCE_S) return false;
  const expected = hmacSha256Hex(secret, `${timestamp}.${rawBody.toString('utf8')}`);
  return signatures.some((sig) => safeEqualStrings(sig, expected));
}

/**
 * Stripe Checkout (cartes internationales). Secrets : `secret_key`
 * (sk_test_… / sk_live_…), `webhook_secret` (whsec_…).
 */
@Injectable()
export class StripeProvider implements PaymentProvider {
  readonly name = 'stripe' as const;

  private auth(ctx: ProviderContext) {
    return { Authorization: `Bearer ${ctx.secrets.secret_key}` };
  }

  async initiate(input: InitiatePaymentInput, ctx: ProviderContext): Promise<InitiatePaymentResult> {
    requireSecrets('Stripe', ctx.secrets, ['secret_key']);
    const currency = input.currency.toLowerCase();
    const res = await providerFetch('Stripe', `${BASE_URL}/checkout/sessions`, {
      headers: { ...this.auth(ctx), 'Idempotency-Key': input.reference },
      form: {
        mode: 'payment',
        success_url: input.returnUrl,
        cancel_url: input.cancelUrl,
        client_reference_id: input.reference,
        customer_email: input.customer.email ?? undefined,
        locale: 'fr',
        'line_items[0][quantity]': 1,
        'line_items[0][price_data][currency]': currency,
        'line_items[0][price_data][unit_amount]': toMinorUnits(input.amount, input.currency),
        'line_items[0][price_data][product_data][name]': input.description.slice(0, 250),
        'metadata[reference]': input.reference,
        'metadata[payment_id]': input.paymentId,
        'metadata[cabinet_id]': input.cabinetId,
        'payment_intent_data[metadata][reference]': input.reference,
      },
    });
    if (!res.ok || !res.data?.url) {
      throw new BadGatewayException(`Stripe : ${res.data?.error?.message ?? `erreur ${res.status}`}`);
    }
    return {
      reference: input.reference,
      checkoutUrl: res.data.url,
      providerReference: res.data.id,
      raw: { id: res.data.id },
    };
  }

  async verify(input: VerifyPaymentInput, ctx: ProviderContext): Promise<VerifyPaymentResult> {
    requireSecrets('Stripe', ctx.secrets, ['secret_key']);
    if (!input.providerReference) return { status: 'pending' };
    const res = await providerFetch(
      'Stripe',
      `${BASE_URL}/checkout/sessions/${encodeURIComponent(input.providerReference)}`,
      { headers: this.auth(ctx) },
    );
    if (!res.ok) {
      throw new BadGatewayException(`Stripe : ${res.data?.error?.message ?? `erreur ${res.status}`}`);
    }
    const session = res.data ?? {};
    const currency = String(session.currency ?? '').toUpperCase();
    const paid = ['paid', 'no_payment_required'].includes(session.payment_status);
    return {
      status: paid ? 'paid' : session.status === 'expired' ? 'failed' : 'pending',
      amount: session.amount_total !== undefined && currency ? fromMinorUnits(session.amount_total, currency) : null,
      currency: currency || null,
      channel: 'card',
      failureReason: session.status === 'expired' ? 'Session de paiement expirée' : null,
      raw: {
        id: session.id,
        status: session.status,
        payment_status: session.payment_status,
        payment_intent: session.payment_intent,
      },
    };
  }

  async parseWebhook(req: WebhookRequest, ctx: ProviderContext): Promise<ParsedWebhook> {
    const signatureValid = verifyStripeSignature(
      headerValue(req.headers, 'stripe-signature'),
      req.rawBody,
      ctx.secrets.webhook_secret ?? '',
    );
    const event = req.body ?? {};
    const object = event.data?.object ?? {};
    return {
      // Stripe : la signature est OBLIGATOIRE (secret de webhook requis).
      signatureValid,
      eventId: String(event.id ?? `stripe-${Date.now()}`).slice(0, 191),
      reference: object.client_reference_id ?? object.metadata?.reference ?? null,
      providerReference: object.id ?? null,
      ignore: !HANDLED_EVENTS.has(event.type),
      raw: { id: event.id, type: event.type, object_id: object.id, payment_status: object.payment_status },
    };
  }

  async testConnection(ctx: ProviderContext) {
    if (!ctx.secrets.secret_key) return { ok: false, message: 'Renseignez secret_key.' };
    const res = await providerFetch('Stripe', `${BASE_URL}/balance`, { headers: this.auth(ctx) });
    if (!res.ok) return { ok: false, message: `Clé refusée par Stripe (${res.data?.error?.message ?? res.status}).` };
    const live = String(ctx.secrets.secret_key).startsWith('sk_live_');
    return { ok: true, message: `Clé acceptée par Stripe (${live ? 'production' : 'test'}).` };
  }

  async refund(
    input: { reference: string; providerReference?: string | null; amount: number; currency: string; payload?: any },
    ctx: ProviderContext,
  ) {
    requireSecrets('Stripe', ctx.secrets, ['secret_key']);
    let paymentIntent: string | null = input.payload?.payment_intent ?? null;
    if (!paymentIntent && input.providerReference) {
      const session = await this.verify({ reference: input.reference, providerReference: input.providerReference }, ctx);
      paymentIntent = session.raw?.payment_intent ?? null;
    }
    if (!paymentIntent) return { ok: false, message: 'Paiement Stripe introuvable pour le remboursement.' };
    const res = await providerFetch('Stripe', `${BASE_URL}/refunds`, {
      headers: { ...this.auth(ctx), 'Idempotency-Key': `refund-${input.reference}-${input.amount}` },
      form: { payment_intent: paymentIntent, amount: toMinorUnits(input.amount, input.currency) },
    });
    if (!res.ok) {
      return { ok: false, message: `Stripe : ${res.data?.error?.message ?? res.status}`, raw: res.data };
    }
    return { ok: true, message: `Remboursement Stripe ${res.data?.id} (${res.data?.status}).`, raw: { id: res.data?.id, status: res.data?.status } };
  }
}
