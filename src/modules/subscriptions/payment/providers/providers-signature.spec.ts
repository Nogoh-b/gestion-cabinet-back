/**
 * Vérification des signatures de webhooks : une notification falsifiée ne doit
 * jamais être acceptée (le statut est de toute façon relu via l'API).
 */
import { describe, expect, it } from '@jest/globals';
import { createHmac } from 'crypto';
import { StripeProvider, verifyStripeSignature, toMinorUnits } from './stripe.provider';
import { NotchPayProvider } from './notchpay.provider';
import { CinetPayProvider } from './cinetpay.provider';

const hmac = (secret: string, payload: string | Buffer) =>
  createHmac('sha256', secret).update(payload).digest('hex');

describe('Stripe', () => {
  const secret = 'whsec_test';
  const body = Buffer.from(JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed' }));
  const now = 1_800_000_000;

  it('accepte une signature valide et récente', () => {
    const header = `t=${now},v1=${hmac(secret, `${now}.${body.toString()}`)}`;
    expect(verifyStripeSignature(header, body, secret, now + 10)).toBe(true);
  });

  it('refuse un corps modifié', () => {
    const header = `t=${now},v1=${hmac(secret, `${now}.${body.toString()}`)}`;
    expect(verifyStripeSignature(header, Buffer.from('{"id":"evt_2"}'), secret, now)).toBe(false);
  });

  it('refuse une signature trop ancienne (rejeu)', () => {
    const header = `t=${now},v1=${hmac(secret, `${now}.${body.toString()}`)}`;
    expect(verifyStripeSignature(header, body, secret, now + 3600)).toBe(false);
  });

  it('refuse sans secret configuré', async () => {
    const parsed = await new StripeProvider().parseWebhook(
      { headers: { 'stripe-signature': `t=${now},v1=abc` }, rawBody: body, body: JSON.parse(body.toString()) },
      { methodCode: 'stripe', mode: 'sandbox', secrets: {}, publicConfig: {} },
    );
    expect(parsed.signatureValid).toBe(false);
  });

  it('convertit les montants selon la devise', () => {
    expect(toMinorUnits(9900, 'XAF')).toBe(9900);
    expect(toMinorUnits(19.99, 'EUR')).toBe(1999);
  });
});

describe('NotchPay', () => {
  const ctx = { methodCode: 'notchpay', mode: 'sandbox' as const, secrets: { webhook_hash: 'hash_key' }, publicConfig: {} };
  const payload = { event: 'payment.complete', id: 'evt_n1', data: { reference: 'trx.1', merchant_reference: 'KS1-AB' } };
  const raw = Buffer.from(JSON.stringify(payload));

  it('accepte la signature HMAC du corps brut', async () => {
    const parsed = await new NotchPayProvider().parseWebhook(
      { headers: { 'x-notch-signature': hmac('hash_key', raw) }, rawBody: raw, body: payload },
      ctx,
    );
    expect(parsed.signatureValid).toBe(true);
    expect(parsed.reference).toBe('KS1-AB');
    expect(parsed.providerReference).toBe('trx.1');
  });

  it('refuse une signature falsifiée', async () => {
    const parsed = await new NotchPayProvider().parseWebhook(
      { headers: { 'x-notch-signature': 'deadbeef' }, rawBody: raw, body: payload },
      ctx,
    );
    expect(parsed.signatureValid).toBe(false);
  });
});

describe('CinetPay', () => {
  const ctx = { methodCode: 'cinetpay', mode: 'sandbox' as const, secrets: { apikey: 'k', site_id: 's', secret_key: 'sk' }, publicConfig: {} };
  const body = { cpm_site_id: 's', cpm_trans_id: 'KS2-CD', cpm_trans_date: '2026-10-13 10:00:00', cpm_amount: '9900', cpm_currency: 'XAF' };

  it('vérifie le jeton x-token (HMAC des champs ordonnés)', async () => {
    const token = hmac('sk', 's' + 'KS2-CD' + '2026-10-13 10:00:00' + '9900' + 'XAF');
    const parsed = await new CinetPayProvider().parseWebhook({ headers: { 'x-token': token }, rawBody: null, body }, ctx);
    expect(parsed.signatureValid).toBe(true);
    expect(parsed.reference).toBe('KS2-CD');
  });

  it('refuse un jeton invalide', async () => {
    const parsed = await new CinetPayProvider().parseWebhook({ headers: { 'x-token': 'faux' }, rawBody: null, body }, ctx);
    expect(parsed.signatureValid).toBe(false);
  });

  it('ignore le ping de vérification d’URL', async () => {
    const parsed = await new CinetPayProvider().parseWebhook({ headers: {}, rawBody: null, body: {} }, ctx);
    expect(parsed.ignore).toBe(true);
  });
});
