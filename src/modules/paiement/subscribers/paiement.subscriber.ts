import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, InsertEvent, Repository } from 'typeorm';

import { NotificationDispatcher } from 'src/core/notifications/notification-dispatcher.service';
import { NotifiableEvent } from 'src/core/notifications/notification-events.enum';
import { NotifiableSubscriber } from 'src/core/subscribers/notifiable.subscriber';
import { getCurrentTenantId } from 'src/core/tenant/tenant.context';
import { Cabinet } from 'src/modules/cabinet/entities/cabinet.entity';
import { buildEntityMailContext } from 'src/modules/mail-template/mail-variables';
import { StatutPaiement } from '../dto/create-paiement.dto';
import { Paiement } from '../entities/paiement.entity';

/**
 * Les reçus ne partent plus depuis afterInsert : la création produit un
 * paiement EN_ATTENTE. L'outbox déclenche la notification uniquement après
 * validation transactionnelle, et conserve ainsi la possibilité de reprise.
 */
@Injectable()
export class PaiementSubscriber extends NotifiableSubscriber<Paiement> {
  constructor(
    dataSource: DataSource,
    notificationDispatcher: NotificationDispatcher,
    @InjectRepository(Cabinet)
    private readonly cabinetRepo: Repository<Cabinet>,
    @InjectRepository(Paiement)
    private readonly paiementRepo: Repository<Paiement>,
  ) {
    super(dataSource, notificationDispatcher);
  }

  listenTo() {
    return Paiement;
  }

  protected async onAfterCreate(
    _entity: Paiement,
    _event: InsertEvent<Paiement>,
  ): Promise<void> {
    // Intentionnellement vide : payment.validated est l'unique déclencheur.
  }

  @OnEvent('outbox.payment.validated', { async: true })
  async onPaymentValidated(payload: any): Promise<void> {
    const paiement = await this.paiementRepo.findOne({
      where: {
        id: String(payload.paymentId),
        tenant_id: Number(payload.tenantId ?? getCurrentTenantId()),
        status: StatutPaiement.VALIDE,
      },
      relations: ['facture', 'facture.client', 'facture.dossier'],
    });
    if (!paiement?.facture) {
      throw new Error(
        `Paiement validé ${payload.paymentId} introuvable pour notification`,
      );
    }
    const facture: any = paiement.facture;
    const currencySymbol = await this.getCurrencySymbol();
    await this.notificationDispatcher.dispatchStrict({
      event: NotifiableEvent.PAIEMENT_RECEIVED,
      title: `Paiement reçu pour la facture ${facture.numero}`,
      content:
        `Montant reçu : ${formatMoney(paiement.montant, currencySymbol)} ` +
        `(${formatDate(paiement.datePaiement)})`,
      link: `/facturation/factures/${facture.id}`,
      audience: {
        client: {
          user_id: facture.client?.user_id,
          email: facture.client?.email,
          notify: paiement.notifyClientRequested,
        },
        lawyer_id: facture.dossier?.lawyer_id ?? null,
      },
      entity: { type: 'paiement', id: paiement.id as any },
      emailContext: buildEntityMailContext({
        dossier: facture.dossier as any,
        resourceType: 'paiement',
        resource: paiement as any,
      }),
    });
  }

  private async getCurrencySymbol(): Promise<string> {
    const cabinet = await this.cabinetRepo
      .findOne({ where: { id: getCurrentTenantId() } })
      .catch(() => null);
    return cabinet?.currency_symbol ?? cabinet?.currency ?? 'XAF';
  }
}

function formatMoney(value: any, currencySymbol: string): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return String(value ?? '');
  return `${amount.toLocaleString('fr-FR')} ${currencySymbol}`;
}

function formatDate(value: any): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleDateString('fr-FR');
}
