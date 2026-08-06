import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Subscription } from './entities/subscription.entity';
import { SubscriptionPayment } from './entities/subscription-payment.entity';
import { Cabinet } from '../cabinet/entities/cabinet.entity';
import { Plan } from '../plans/entities/plan.entity';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionsController } from './subscriptions.controller';
import { PaymentGatewayService } from './payment/payment-gateway.service';
import { TestPaymentProvider } from './payment/test-payment.provider';
import { PAYMENT_PROVIDER } from './payment/payment-provider.interface';

@Module({
  imports: [
    TypeOrmModule.forFeature([Subscription, SubscriptionPayment, Cabinet, Plan]),
  ],
  controllers: [SubscriptionsController],
  providers: [
    SubscriptionsService,
    PaymentGatewayService,
    TestPaymentProvider,
    // Passerelle active. Brancher une vraie passerelle = remplacer cette ligne
    // (ex: useClass: CinetPayProvider) ou choisir via une factory env.
    { provide: PAYMENT_PROVIDER, useExisting: TestPaymentProvider },
  ],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
