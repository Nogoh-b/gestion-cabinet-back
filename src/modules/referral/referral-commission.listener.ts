import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ReferralCommissionsService } from './referral-commissions.service';

/**
 * Consommateur durable des événements financiers.
 *
 * Les calculs ne sont plus déclenchés par les événements en mémoire
 * `facture.envoyee` ou `paiement.valide`. Seuls les événements issus de
 * l'outbox sont consommés : en cas d'échec, le worker conserve l'événement
 * et le rejoue.
 */
@Injectable()
export class ReferralCommissionListener {
  private readonly logger = new Logger(
    ReferralCommissionListener.name,
  );

  constructor(
    private readonly commissions: ReferralCommissionsService,
  ) {}

  @OnEvent('outbox.invoice.validated', { async: true })
  async handleInvoiceValidated(
    payload: Record<string, any>,
  ): Promise<void> {
    const commission =
      await this.commissions.calculateFromInvoiceEvent(payload);
    if (commission) {
      this.logger.log(
        `Commission ${commission.id} calculée depuis la facture ${payload.invoiceId}`,
      );
    }
  }

  @OnEvent('outbox.payment.validated', { async: true })
  async handlePaymentValidated(
    payload: Record<string, any>,
  ): Promise<void> {
    const commission =
      await this.commissions.calculateFromPaymentEvent(payload);
    if (commission) {
      this.logger.log(
        `Commission ${commission.id} calculée depuis le paiement ${payload.paymentId}`,
      );
    }
  }
}
