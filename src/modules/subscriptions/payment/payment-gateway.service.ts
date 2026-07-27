import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { SubscriptionPayment } from '../entities/subscription-payment.entity';
import {
  InitiatePaymentResult,
  PAYMENT_PROVIDER,
  PaymentProvider,
  ProviderPaymentStatus,
} from './payment-provider.interface';

/**
 * Façade sur la passerelle active : initie une session de paiement pour une
 * échéance et persiste sur celle-ci le provider, la référence et l'URL de
 * paiement. Le service d'abonnement ne dépend que de cette façade.
 */
@Injectable()
export class PaymentGatewayService {
  constructor(
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    @InjectRepository(SubscriptionPayment)
    private readonly payRepo: Repository<SubscriptionPayment>,
  ) {}

  get providerName(): string {
    return this.provider.name;
  }

  /** Vrai si la passerelle active est la passerelle de test (simulation autorisée). */
  get isTest(): boolean {
    return this.provider.name === 'test';
  }

  async initiate(payment: SubscriptionPayment): Promise<InitiatePaymentResult> {
    const res = await this.provider.initiate({
      paymentId: payment.id,
      amount: Number(payment.amount),
      currency: payment.currency,
      cabinetId: payment.cabinet_id,
    });
    payment.provider = this.provider.name;
    payment.reference = res.reference;
    payment.checkout_url = res.checkoutUrl;
    await this.payRepo.save(payment);
    return res;
  }

  verify(reference: string): Promise<ProviderPaymentStatus> {
    return this.provider.verify(reference);
  }
}
