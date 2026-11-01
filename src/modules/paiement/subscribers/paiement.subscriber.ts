import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, InsertEvent, Repository, UpdateEvent } from 'typeorm';

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
    entity: Paiement,
    event: InsertEvent<Paiement>,
  ): Promise<void> {
    // Le reçu part uniquement de payment.validated (outbox). Seul un paiement
    // déclaré par le client depuis son espace prévient le cabinet ici.
    if (
      entity.declared_by_client &&
      Number(entity.status) === StatutPaiement.EN_ATTENTE
    ) {
      await this.notifyDeclaredPayment(entity.id as any, event);
    }
  }

  protected async onAfterUpdate(
    entity: Partial<Paiement>,
    event: UpdateEvent<Paiement>,
  ): Promise<void> {
    if (!this.hasColumnChanged(event, 'status')) return;
    const change = this.getFieldChanges(event, ['status']).find(
      (c) => c.field === 'status',
    );
    if (
      change &&
      Number(change.oldValue) === StatutPaiement.EN_ATTENTE &&
      Number(change.newValue) === StatutPaiement.REJETE
    ) {
      const rejectedId = entity.id ?? event.databaseEntity?.id;
      if (rejectedId) await this.notifyRejectedPayment(rejectedId, event);
    }
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

  /** Le client déclare un paiement : l'avocat du dossier et les admins l'approuvent. */
  private async notifyDeclaredPayment(
    id: string | number,
    event: InsertEvent<Paiement>,
  ): Promise<void> {
    const paiement = await this.load(id, event);
    if (!paiement?.facture) return;
    const facture: any = paiement.facture;
    const currencySymbol = await this.getCurrencySymbol();
    const who =
      facture.client?.company_name?.trim() ||
      `${facture.client?.first_name ?? ''} ${facture.client?.last_name ?? ''}`.trim() ||
      'Un client';

    await this.notify({
      event: NotifiableEvent.CLIENT_PAYMENT_DECLARED,
      title: `Paiement déclaré — facture ${facture.numero}`,
      content:
        `${who} déclare avoir payé ${formatMoney(paiement.montant, currencySymbol)} ` +
        `(${formatDate(paiement.datePaiement)}). À vérifier et valider.`,
      link: `/facturation/factures/${facture.id}`,
      audience: { lawyer_id: facture.dossier?.lawyer_id ?? null },
      entity: { type: 'paiement', id: paiement.id as any },
    });
  }

  /** Le cabinet rejette un paiement déclaré par le client : le client est informé. */
  private async notifyRejectedPayment(
    id: string | number,
    event: UpdateEvent<Paiement>,
  ): Promise<void> {
    const paiement = await this.load(id, event);
    if (!paiement?.facture || !paiement.declared_by_client) return;
    const facture: any = paiement.facture;
    const currencySymbol = await this.getCurrencySymbol();

    await this.notify({
      event: NotifiableEvent.PAIEMENT_REJECTED,
      title: `Paiement non validé — facture ${facture.numero}`,
      content:
        `Le paiement de ${formatMoney(paiement.montant, currencySymbol)} que vous avez déclaré n'a pas pu être validé.` +
        (paiement.notes
          ? ` Motif : ${String(paiement.notes).split(/\r?\n/)[0]}`
          : ''),
      link: `/espace-client/factures/${facture.id}`,
      audience: {
        client: {
          customer_id: facture.client?.id,
          email: facture.client?.email,
          notify: true,
        },
        lawyer_id: null,
        admin_ids_override: [],
      },
      entity: { type: 'paiement', id: paiement.id as any },
    });
  }

  private load(
    id: string | number,
    event?: InsertEvent<Paiement> | UpdateEvent<Paiement>,
  ): Promise<Paiement | null> {
    return this.loadEntity<Paiement>(
      id,
      { relations: ['facture', 'facture.client', 'facture.dossier'] },
      event,
    );
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
