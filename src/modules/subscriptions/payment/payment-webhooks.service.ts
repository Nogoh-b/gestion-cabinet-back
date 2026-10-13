import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { PaymentWebhookEvent } from './entities/payment-webhook-event.entity';
import { PaymentMethodsService } from './payment-methods.service';
import { PaymentProviderRegistry } from './payment-provider.registry';
import { WebhookRequest } from './payment-provider.interface';
import { SubscriptionsService } from '../subscriptions.service';
import { PaymentProviderCode } from './entities/payment-method.entity';

/**
 * Traitement des notifications des passerelles :
 *  1. signature vérifiée (rejet si invalide) ;
 *  2. anti-rejeu (provider, event_id) : un événement déjà traité est ignoré ;
 *  3. statut TOUJOURS relu auprès de la passerelle (reconcilePayment) ;
 *  4. événement journalisé (payment_webhook_events).
 */
@Injectable()
export class PaymentWebhooksService {
  private readonly logger = new Logger(PaymentWebhooksService.name);

  constructor(
    @InjectRepository(PaymentWebhookEvent)
    private readonly events: Repository<PaymentWebhookEvent>,
    private readonly registry: PaymentProviderRegistry,
    private readonly methods: PaymentMethodsService,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  async handle(providerCode: string, req: WebhookRequest) {
    if (providerCode === 'test' || !this.registry.has(providerCode)) {
      throw new BadRequestException('Passerelle inconnue');
    }
    const provider = this.registry.get(providerCode);
    const method = await this.methods.findByProvider(providerCode as PaymentProviderCode);
    if (!method) throw new BadRequestException('Passerelle non configurée');
    const ctx = await this.methods.contextFor(method);
    const parsed = await provider.parseWebhook(req, ctx);
    if (parsed.ignore) return { received: true, ignored: true };

    let event = await this.events.findOne({
      where: { provider: providerCode, event_id: parsed.eventId },
    });
    if (event?.processed_at) return { received: true, duplicate: true };
    if (!event) {
      try {
        event = await this.events.save(
          this.events.create({
            provider: providerCode,
            event_id: parsed.eventId,
            reference: parsed.reference ?? parsed.providerReference ?? null,
            signature_valid: parsed.signatureValid,
            payload: parsed.raw,
          }),
        );
      } catch (error) {
        // Notification concurrente du même événement : déjà prise en charge.
        if (error instanceof QueryFailedError) return { received: true, duplicate: true };
        throw error;
      }
    }

    if (!parsed.signatureValid) {
      await this.events.update(event.id, { error: 'Signature invalide' });
      this.logger.warn(`[Webhook ${providerCode}] signature invalide (event ${parsed.eventId})`);
      throw new BadRequestException('Signature invalide');
    }

    const payment = await this.subscriptions.findPaymentByReference(
      parsed.reference,
      parsed.providerReference,
    );
    if (!payment) {
      await this.events.update(event.id, {
        error: 'Échéance introuvable pour cette référence',
        processed_at: new Date(),
      });
      return { received: true, matched: false };
    }

    try {
      const status = await this.subscriptions.reconcilePayment(payment);
      await this.events.update(event.id, {
        payment_id: payment.id,
        processed_at: new Date(),
        error: null,
      });
      return { received: true, status };
    } catch (error) {
      // Non traité : la passerelle pourra renvoyer la notification.
      await this.events.update(event.id, {
        payment_id: payment.id,
        error: String((error as Error).message ?? error).slice(0, 500),
      });
      throw error;
    }
  }

  /** Retour navigateur : vérifie la transaction (best effort) avant redirection. */
  async handleReturn(reference: string | null) {
    if (!reference) return { status: 'unknown', cabinetId: null };
    const payment = await this.subscriptions.findPaymentByReference(reference, null);
    if (!payment) return { status: 'unknown', cabinetId: null };
    try {
      const status = await this.subscriptions.reconcilePayment(payment);
      return { status, cabinetId: payment.cabinet_id };
    } catch (error) {
      this.logger.warn(`[Retour paiement] ${reference} : ${(error as Error).message}`);
      return { status: payment.status, cabinetId: payment.cabinet_id };
    }
  }
}
