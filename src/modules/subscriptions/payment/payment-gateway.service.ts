import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { Repository } from 'typeorm';

import { SubscriptionPayment } from '../entities/subscription-payment.entity';
import { PaymentMethod } from './entities/payment-method.entity';
import { PaymentMethodsService, apiPublicUrl } from './payment-methods.service';
import { PaymentProviderRegistry } from './payment-provider.registry';
import { VerifyPaymentResult } from './payment-provider.interface';

export interface PaymentStartResult {
  payment_id: number;
  kind: 'gateway' | 'manual';
  method: string;
  provider: string | null;
  reference: string | null;
  checkout_url: string | null;
  amount: number;
  currency: string;
  /** Moyens manuels : instructions, RIB, numéros… */
  instructions: Record<string, any> | null;
}

export interface PaymentCustomer {
  email: string | null;
  name: string | null;
  phone: string | null;
}

/**
 * Façade passerelles : démarre un paiement avec le moyen choisi (session en
 * ligne ou instructions manuelles) et relit l'état d'une transaction.
 */
@Injectable()
export class PaymentGatewayService {
  constructor(
    private readonly registry: PaymentProviderRegistry,
    private readonly methods: PaymentMethodsService,
    @InjectRepository(SubscriptionPayment)
    private readonly payRepo: Repository<SubscriptionPayment>,
  ) {}

  async start(
    payment: SubscriptionPayment,
    method: PaymentMethod,
    customer: PaymentCustomer,
    description: string,
  ): Promise<PaymentStartResult> {
    const amount = Number(payment.amount);
    if (amount < Number(method.min_amount ?? 0)) {
      throw new BadRequestException('Montant inférieur au minimum accepté par ce moyen de paiement.');
    }
    if (method.currencies?.length && !method.currencies.includes(payment.currency)) {
      throw new BadRequestException(`Ce moyen de paiement n'accepte pas la devise ${payment.currency}.`);
    }

    payment.payment_method_id = method.id ?? null;
    payment.method = method.code.slice(0, 30);
    payment.fee_amount = this.methods.feeFor(method, amount);
    payment.failure_reason = null;

    if (method.kind === 'manual') {
      payment.provider = null;
      payment.reference = null;
      payment.provider_reference = null;
      payment.checkout_url = null;
      await this.payRepo.save(payment);
      return {
        payment_id: payment.id,
        kind: 'manual',
        method: method.code,
        provider: null,
        reference: null,
        checkout_url: null,
        amount,
        currency: payment.currency,
        instructions: { label: method.label, ...(method.public_config ?? {}) },
      };
    }

    const provider = this.registry.get(method.provider);
    const ctx = await this.methods.contextFor(method);
    const reference = `KS${payment.id}-${randomBytes(4).toString('hex').toUpperCase()}`;
    const api = apiPublicUrl();
    const returnBase = `${api}/payments/return/${provider.name}?ref=${encodeURIComponent(reference)}`;
    const res = await provider.initiate(
      {
        paymentId: payment.id,
        cabinetId: payment.cabinet_id,
        amount,
        currency: payment.currency,
        reference,
        description,
        customer,
        returnUrl:
          provider.name === 'stripe' ? `${returnBase}&session_id={CHECKOUT_SESSION_ID}` : returnBase,
        cancelUrl: `${returnBase}&cancelled=1`,
        notifyUrl: `${api}/payments/webhooks/${provider.name}`,
      },
      ctx,
    );
    payment.provider = provider.name;
    payment.reference = res.reference;
    payment.provider_reference = res.providerReference ?? null;
    payment.checkout_url = res.checkoutUrl?.slice(0, 512) ?? null;
    payment.provider_payload = res.raw ?? null;
    await this.payRepo.save(payment);
    return {
      payment_id: payment.id,
      kind: 'gateway',
      method: method.code,
      provider: provider.name,
      reference: res.reference,
      checkout_url: res.checkoutUrl,
      amount,
      currency: payment.currency,
      instructions: null,
    };
  }

  /** État de la transaction auprès de la passerelle (null si non applicable). */
  async verify(payment: SubscriptionPayment): Promise<VerifyPaymentResult | null> {
    if (!payment.provider || !payment.reference || !this.registry.has(payment.provider)) {
      return null;
    }
    const provider = this.registry.get(payment.provider);
    const method =
      (await this.methods.findById(payment.payment_method_id)) ??
      (provider.name === 'test'
        ? await this.methods.resolveForPayment('test')
        : await this.methods.findByProvider(provider.name));
    if (!method) return null;
    const ctx = await this.methods.contextFor(method);
    return provider.verify(
      { reference: payment.reference, providerReference: payment.provider_reference },
      ctx,
    );
  }

  /** Remboursement via l'API de la passerelle, si elle le permet. */
  async refundViaProvider(payment: SubscriptionPayment, amount: number) {
    if (!payment.provider || !this.registry.has(payment.provider)) {
      return { ok: false, message: 'Aucune passerelle associée à ce paiement.' };
    }
    const provider = this.registry.get(payment.provider);
    if (!provider.refund) {
      return { ok: false, message: `Remboursement automatique indisponible pour ${provider.name}.` };
    }
    const method =
      (await this.methods.findById(payment.payment_method_id)) ??
      (await this.methods.findByProvider(provider.name));
    if (!method) return { ok: false, message: 'Moyen de paiement introuvable.' };
    return provider.refund(
      {
        reference: payment.reference ?? '',
        providerReference: payment.provider_reference,
        amount,
        currency: payment.currency,
        payload: payment.provider_payload,
      },
      await this.methods.contextFor(method),
    );
  }
}
