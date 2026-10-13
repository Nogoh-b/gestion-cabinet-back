import { BadGatewayException, BadRequestException, Injectable } from '@nestjs/common';
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

const BASE_URL = 'https://api-checkout.cinetpay.com/v2';

/** Ordre des champs signés par CinetPay (en-tête `x-token`). */
const SIGNED_FIELDS = [
  'cpm_site_id',
  'cpm_trans_id',
  'cpm_trans_date',
  'cpm_amount',
  'cpm_currency',
  'signature',
  'payment_method',
  'cel_phone_num',
  'cpm_phone_prefixe',
  'cpm_language',
  'cpm_version',
  'cpm_payment_config',
  'cpm_page_action',
  'cpm_custom',
  'cpm_designation',
  'cpm_error_message',
];

/** CinetPay refuse certains caractères spéciaux dans la description. */
function cleanDescription(text: string) {
  return String(text ?? '')
    .replace(/[#/$_&%@*<>{}[\]|\\^~`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 190);
}

/**
 * CinetPay (Mobile Money MTN/Orange, cartes — zone CEMAC/UEMOA).
 * Secrets : `apikey`, `site_id`, `secret_key` (signature des notifications).
 */
@Injectable()
export class CinetPayProvider implements PaymentProvider {
  readonly name = 'cinetpay' as const;

  async initiate(input: InitiatePaymentInput, ctx: ProviderContext): Promise<InitiatePaymentResult> {
    requireSecrets('CinetPay', ctx.secrets, ['apikey', 'site_id']);
    const amount = Math.round(Number(input.amount));
    if (['XAF', 'XOF'].includes(input.currency) && amount % 5 !== 0) {
      throw new BadRequestException('CinetPay exige un montant multiple de 5.');
    }
    const [firstName, ...rest] = String(input.customer.name ?? 'Client').split(' ');
    const res = await providerFetch('CinetPay', `${BASE_URL}/payment`, {
      json: {
        apikey: ctx.secrets.apikey,
        site_id: ctx.secrets.site_id,
        transaction_id: input.reference,
        amount,
        currency: input.currency,
        description: cleanDescription(input.description),
        notify_url: input.notifyUrl,
        return_url: input.returnUrl,
        channels: ctx.publicConfig?.channels || 'ALL',
        lang: 'fr',
        metadata: String(input.paymentId),
        customer_name: rest.join(' ') || firstName,
        customer_surname: firstName,
        customer_email: input.customer.email ?? undefined,
        customer_phone_number: input.customer.phone ?? undefined,
        customer_address: ctx.publicConfig?.customer_address || 'N/A',
        customer_city: ctx.publicConfig?.customer_city || 'Douala',
        customer_country: ctx.publicConfig?.customer_country || 'CM',
        customer_state: ctx.publicConfig?.customer_country || 'CM',
        customer_zip_code: '00000',
      },
    });
    const url = res.data?.data?.payment_url;
    if (String(res.data?.code) !== '201' || !url) {
      throw new BadGatewayException(
        `CinetPay : ${res.data?.description ?? res.data?.message ?? `erreur ${res.status}`}`,
      );
    }
    return {
      reference: input.reference,
      checkoutUrl: url,
      providerReference: res.data?.data?.payment_token ?? null,
      raw: { code: res.data?.code, message: res.data?.message },
    };
  }

  async verify(input: VerifyPaymentInput, ctx: ProviderContext): Promise<VerifyPaymentResult> {
    requireSecrets('CinetPay', ctx.secrets, ['apikey', 'site_id']);
    const res = await providerFetch('CinetPay', `${BASE_URL}/payment/check`, {
      json: {
        apikey: ctx.secrets.apikey,
        site_id: ctx.secrets.site_id,
        transaction_id: input.reference,
      },
    });
    const data = res.data?.data ?? {};
    const status = String(data.status ?? '').toUpperCase();
    return {
      status:
        status === 'ACCEPTED'
          ? 'paid'
          : ['REFUSED', 'CANCELED', 'CANCELLED', 'FAILED'].includes(status)
            ? 'failed'
            : 'pending',
      amount: data.amount !== undefined ? Number(data.amount) : null,
      currency: data.currency ?? null,
      channel: data.payment_method ?? null,
      failureReason: status && status !== 'ACCEPTED' ? `${status} ${res.data?.message ?? ''}`.trim() : null,
      raw: { code: res.data?.code, message: res.data?.message, data },
    };
  }

  async parseWebhook(req: WebhookRequest, ctx: ProviderContext): Promise<ParsedWebhook> {
    const body = req.body ?? {};
    const reference = body.cpm_trans_id ?? null;
    if (!reference) {
      // CinetPay « ping » l'URL de notification (GET/POST vide) pour la tester.
      return { signatureValid: false, eventId: `ping-${Date.now()}`, reference: null, ignore: true, raw: body };
    }
    let signatureValid = false;
    const token = headerValue(req.headers, 'x-token');
    if (ctx.secrets.secret_key && token) {
      const payload = SIGNED_FIELDS.map((f) => body[f] ?? '').join('');
      signatureValid = safeEqualStrings(hmacSha256Hex(ctx.secrets.secret_key, payload), token);
    }
    return {
      // Sans clé secrète configurée, la notification n'est qu'un déclencheur :
      // le statut est de toute façon relu via l'API (verify).
      signatureValid: ctx.secrets.secret_key ? signatureValid : true,
      eventId: `${reference}:${body.cpm_trans_date ?? ''}:${body.cpm_error_message ?? ''}`.slice(0, 191),
      reference,
      raw: body,
    };
  }

  async testConnection(ctx: ProviderContext) {
    if (!ctx.secrets.apikey || !ctx.secrets.site_id) {
      return { ok: false, message: 'Renseignez apikey et site_id.' };
    }
    const res = await providerFetch('CinetPay', `${BASE_URL}/payment/check`, {
      json: { apikey: ctx.secrets.apikey, site_id: ctx.secrets.site_id, transaction_id: `TEST-${Date.now()}` },
    });
    const code = String(res.data?.code ?? '');
    // 609 : clé API invalide ; 613 : site_id invalide.
    if (['608', '609', '613'].includes(code)) {
      return { ok: false, message: `Clés refusées par CinetPay (${res.data?.message ?? code}).` };
    }
    return { ok: true, message: 'Clés acceptées par CinetPay.' };
  }
}
