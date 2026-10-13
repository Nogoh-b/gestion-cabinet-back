import { Injectable, NotFoundException } from '@nestjs/common';
import { PaymentProvider } from './payment-provider.interface';
import { PaymentProviderCode } from './entities/payment-method.entity';
import { TestPaymentProvider } from './test-payment.provider';
import { CinetPayProvider } from './providers/cinetpay.provider';
import { NotchPayProvider } from './providers/notchpay.provider';
import { StripeProvider } from './providers/stripe.provider';
import { isPaymentTestEnabled } from './payment-test-mode';

/** Annuaire des passerelles disponibles (la passerelle test seulement hors production). */
@Injectable()
export class PaymentProviderRegistry {
  private readonly providers: Map<string, PaymentProvider>;

  constructor(
    test: TestPaymentProvider,
    cinetpay: CinetPayProvider,
    notchpay: NotchPayProvider,
    stripe: StripeProvider,
  ) {
    this.providers = new Map<string, PaymentProvider>([
      [test.name, test],
      [cinetpay.name, cinetpay],
      [notchpay.name, notchpay],
      [stripe.name, stripe],
    ]);
  }

  get(code: PaymentProviderCode | string | null | undefined): PaymentProvider {
    const provider = code ? this.providers.get(code) : undefined;
    if (!provider || (provider.name === 'test' && !isPaymentTestEnabled())) {
      throw new NotFoundException(`Passerelle inconnue : ${code ?? '—'}`);
    }
    return provider;
  }

  has(code: string): boolean {
    return this.providers.has(code) && (code !== 'test' || isPaymentTestEnabled());
  }
}
