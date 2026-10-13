import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Subscription } from './entities/subscription.entity';
import { SubscriptionPayment } from './entities/subscription-payment.entity';
import { SubscriptionEvent } from './entities/subscription-event.entity';
import { SubscriptionEventsService } from './subscription-events.service';
import { Cabinet } from '../cabinet/entities/cabinet.entity';
import { Plan } from '../plans/entities/plan.entity';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionsController } from './subscriptions.controller';
import { PaymentGatewayService } from './payment/payment-gateway.service';
import { TestPaymentProvider } from './payment/test-payment.provider';
import { PaymentMethod } from './payment/entities/payment-method.entity';
import { PaymentWebhookEvent } from './payment/entities/payment-webhook-event.entity';
import { PaymentMethodsService } from './payment/payment-methods.service';
import { PaymentProviderRegistry } from './payment/payment-provider.registry';
import { PaymentWebhooksService } from './payment/payment-webhooks.service';
import { PaymentWebhooksController } from './payment/payment-webhooks.controller';
import { CinetPayProvider } from './payment/providers/cinetpay.provider';
import { NotchPayProvider } from './payment/providers/notchpay.provider';
import { StripeProvider } from './payment/providers/stripe.provider';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Subscription,
      SubscriptionPayment,
      SubscriptionEvent,
      PaymentMethod,
      PaymentWebhookEvent,
      Cabinet,
      Plan,
    ]),
  ],
  controllers: [SubscriptionsController, PaymentWebhooksController],
  providers: [
    SubscriptionsService,
    SubscriptionEventsService,
    PaymentGatewayService,
    PaymentMethodsService,
    PaymentProviderRegistry,
    PaymentWebhooksService,
    TestPaymentProvider,
    CinetPayProvider,
    NotchPayProvider,
    StripeProvider,
  ],
  exports: [
    SubscriptionsService,
    SubscriptionEventsService,
    PaymentMethodsService,
    PaymentProviderRegistry,
  ],
})
export class SubscriptionsModule {}
