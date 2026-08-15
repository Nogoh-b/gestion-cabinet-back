import { NotificationDispatcher } from 'src/core/notifications/notification-dispatcher.service';
import { NotifiableEvent } from 'src/core/notifications/notification-events.enum';
import { NotifiableSubscriber } from 'src/core/subscribers/notifiable.subscriber';
import { DataSource, InsertEvent, Repository, UpdateEvent } from 'typeorm';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { Paiement } from '../entities/paiement.entity';
import { Cabinet } from 'src/modules/cabinet/entities/cabinet.entity';
import { buildEntityMailContext } from 'src/modules/mail-template/mail-variables';
import { getCurrentTenantId } from 'src/core/tenant/tenant.context';
import { StatutPaiement } from '../dto/create-paiement.dto';

/**
 * Subscriber métier pour les paiements.
 *
 * Événements émis :
 *  - PAIEMENT_RECEIVED → quand un paiement est enregistré
 *    Le client reçoit un reçu si `notify_client=true` ; l'avocat du dossier
 *    et les admins sont notifiés selon leurs préférences.
 */
@Injectable()
export class PaiementSubscriber extends NotifiableSubscriber<Paiement> {
  constructor(
    dataSource: DataSource,
    notificationDispatcher: NotificationDispatcher,
    private readonly eventEmitter: EventEmitter2,
    @InjectRepository(Cabinet)
    private readonly cabinetRepo: Repository<Cabinet>,
  ) {
    super(dataSource, notificationDispatcher);
  }

  private async getCurrencySymbol(): Promise<string> {
    const cabinet = await this.cabinetRepo.findOne({ where: { id: getCurrentTenantId() } }).catch(() => null);
    return cabinet?.currency_symbol ?? cabinet?.currency ?? 'XAF';
  }

  listenTo() {
    return Paiement;
  }

  protected async onAfterCreate(
    entity: Paiement,
    event: InsertEvent<Paiement>,
  ): Promise<void> {
    await this.dispatchValidatedPayment(entity.id as any, entity, event);
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
      !change ||
      Number(change.oldValue) === StatutPaiement.VALIDE ||
      Number(change.newValue) !== StatutPaiement.VALIDE
    ) {
      return;
    }

    const id = entity.id ?? (event.databaseEntity as Paiement)?.id;
    if (!id) return;
    await this.dispatchValidatedPayment(id, entity, event);
  }

  private async dispatchValidatedPayment(
    id: string | number,
    source: Partial<Paiement>,
    event: InsertEvent<Paiement> | UpdateEvent<Paiement>,
  ): Promise<void> {
    // Recharger avec la facture + dossier + client pour résoudre l'audience
    const paiement = await this.load(id, event);
    if (!paiement?.facture) return;
    if (Number(paiement.status) !== StatutPaiement.VALIDE) return;

    const facture: any = paiement.facture;
    const notifyClient = this.resolveTransientBoolean('notify_client', source, paiement as any);

    const currencySymbol = await this.getCurrencySymbol();

    this.logger.log(
      `📢 Paiement reçu | id=${paiement.id} | montant=${formatMoney(paiement.montant, currencySymbol)} | facture=${facture.numero} | notify_client=${notifyClient}`,
    );

    this.eventEmitter.emit('paiement.valide', { ...paiement, facture });

    await this.notify({
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
          notify: notifyClient,
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

  private load(
    id: string | number,
    event?: InsertEvent<Paiement> | UpdateEvent<Paiement>,
  ): Promise<Paiement | null> {
    return this.loadEntity<Paiement>(id, {
      relations: ['facture', 'facture.client', 'facture.dossier'],
    }, event);
  }
}

function formatMoney(v: any, currencySymbol = 'XAF'): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v ?? '');
  return `${n.toLocaleString('fr-FR')} ${currencySymbol}`;
}

function formatDate(v: any): string {
  if (!v) return '';
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime())
    ? String(v)
    : d.toLocaleDateString('fr-FR');
}
