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
  headerValue,
} from '../payment-provider.interface';
import {
  hmacSha256Hex,
  providerFetch,
  requireSecrets,
  safeEqualStrings,
} from './provider-http';

const BASE_URL = 'https://api.notchpay.co';

/**
 * NotchPay (Mobile Money MTN/Orange Cameroun, cartes).
 * Secrets : `public_key` (en-tête Authorization), `private_key` (X-Grant,
 * facultatif), `webhook_hash` (signature `x-notch-signature`).
 */
@Injectable()
export class NotchPayProvider implements PaymentProvider {
  readonly name = 'notchpay' as const;

  private headers(ctx: ProviderContext): Record<string, string> {
    return {
      Authorization: ctx.secrets.public_key,
      ...(ctx.secrets.private_key ? { 'X-Grant': ctx.secrets.private_key } : {}),
    };
  }

  async initiate(input: InitiatePaymentInput, ctx: ProviderContext): Promise<InitiatePaymentResult> {
    requireSecrets('NotchPay', ctx.secrets, ['public_key']);
    const res = await providerFetch('NotchPay', `${BASE_URL}/payments`, {
      headers: this.headers(ctx),
      json: {
        amount: Math.round(Number(input.amount)),
        currency: input.currency,
        reference: input.reference,
        description: input.description.slice(0, 190),
        callback: input.returnUrl,
        email: input.customer.email ?? undefined,
        phone: input.customer.phone ?? undefined,
        customer: {
          email: input.customer.email ?? undefined,
          name: input.customer.name ?? undefined,
          phone: input.customer.phone ?? undefined,
        },
      },
    });
    const url = res.data?.authorization_url;
    if (!res.ok || !url) {
      throw new BadGatewayException(`NotchPay : ${res.data?.message ?? `erreur ${res.status}`}`);
    }
    return {
      reference: input.reference,
      checkoutUrl: url,
      providerReference: res.data?.transaction?.reference ?? null,
      raw: { status: res.data?.status, transaction: res.data?.transaction?.reference },
    };
  }

  async verify(input: VerifyPaymentInput, ctx: ProviderContext): Promise<VerifyPaymentResult> {
    requireSecrets('NotchPay', ctx.secrets, ['public_key']);
    const ref = encodeURIComponent(input.providerReference || input.reference);
    const res = await providerFetch('NotchPay', `${BASE_URL}/payments/${ref}`, {
      headers: this.headers(ctx),
    });
    const trx = res.data?.transaction ?? {};
    const status = String(trx.status ?? '').toLowerCase();
    return {
      status:
        status === 'complete'
          ? 'paid'
          : ['failed', 'canceled', 'cancelled', 'expired', 'rejected'].includes(status)
            ? 'failed'
            : 'pending',
      amount: trx.amount !== undefined ? Number(trx.amount) : null,
      currency: trx.currency ?? null,
      channel: trx.payment_method ?? trx.channel ?? null,
      failureReason: status && status !== 'complete' && status !== 'pending' ? status : null,
      raw: { status: trx.status, reference: trx.reference, merchant_reference: trx.merchant_reference },
    };
  }

  async parseWebhook(req: WebhookRequest, ctx: ProviderContext): Promise<ParsedWebhook> {
    const body = req.body ?? {};
    const signature = headerValue(req.headers, 'x-notch-signature');
    let signatureValid = false;
    if (ctx.secrets.webhook_hash && signature && req.rawBody) {
      signatureValid = safeEqualStrings(hmacSha256Hex(ctx.secrets.webhook_hash, req.rawBody), signature);
    }
    const data = body.data ?? {};
    const event = String(body.event ?? body.type ?? '');
    return {
      signatureValid: ctx.secrets.webhook_hash ? signatureValid : true,
      eventId: String(body.id ?? `${event}:${data.reference ?? ''}`).slice(0, 191),
      reference: data.merchant_reference ?? null,
      providerReference: data.reference ?? null,
      ignore: !event.startsWith('payment.'),
      raw: body,
    };
  }

  async testConnection(ctx: ProviderContext) {
    if (!ctx.secrets.public_key) return { ok: false, message: 'Renseignez public_key.' };
    const res = await providerFetch('NotchPay', `${BASE_URL}/payments?limit=1`, {
      headers: this.headers(ctx),
    });
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: 'Clé refusée par NotchPay.' };
    }
    return { ok: res.ok, message: res.ok ? 'Clés acceptées par NotchPay.' : `Réponse ${res.status}` };
  }
}
