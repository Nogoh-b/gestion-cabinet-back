import { NotificationDispatcher } from 'src/core/notifications/notification-dispatcher.service';
import { NotifiableEvent } from 'src/core/notifications/notification-events.enum';
import { NotifiableSubscriber } from 'src/core/subscribers/notifiable.subscriber';
import { DataSource, InsertEvent, Repository, UpdateEvent } from 'typeorm';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { StatutFacture } from '../dto/create-facture.dto';
import { Facture } from '../entities/facture.entity';
import { Cabinet } from 'src/modules/cabinet/entities/cabinet.entity';
import { buildEntityMailContext } from 'src/modules/mail-template/mail-variables';

/**
 * Subscriber métier pour les factures.
 *
 * Événements émis :
 *  - FACTURE_CREATED          → à la création (client si notify_client=true)
 *  - FACTURE_PAID             → quand le statut passe à PAYEE
 *  - FACTURE_OVERDUE          → quand le statut passe à IMPAYEE
 */
@Injectable()
export class FactureSubscriber extends NotifiableSubscriber<Facture> {
  constructor(
    dataSource: DataSource,
    notificationDispatcher: NotificationDispatcher,
    @InjectRepository(Facture)
    private readonly factureRepo: Repository<Facture>,
    @InjectRepository(Cabinet)
    private readonly cabinetRepo: Repository<Cabinet>,
  ) {
    super(dataSource, notificationDispatcher);
  }

  /** Symbole de la devise active (ex: "FCFA", "€"). */
  private async getCurrencySymbol(): Promise<string> {
    const cabinet = await this.cabinetRepo.findOne({ where: {} }).catch(() => null);
    return cabinet?.currency_symbol ?? cabinet?.currency ?? 'XAF';
  }

  listenTo() {
    return Facture;
  }

  protected async onAfterCreate(
    entity: Facture,
    _event: InsertEvent<Facture>,
  ): Promise<void> {
    // const facture = await this.load(entity.id);
    const loaded = await this.load(entity.id).catch(() => null);
    const facture = loaded ?? entity;
    if (!facture) return;
    const notifyClient = this.resolveTransientBoolean('notify_client', entity, facture as any);

    const currencySymbol = await this.getCurrencySymbol();

    this.logger.log(
      `📢 Facture créée | id=${facture.id} | numero=${facture.numero} | montant=${formatMoney(facture.montantTTC, currencySymbol)} | échéance=${formatDate(facture.dateEcheance)} | notify_client=${notifyClient}`,
    );

    await this.notify({
      event: NotifiableEvent.FACTURE_CREATED,
      title: `Nouvelle facture ${facture.numero}`,
      content:
        `Facture ${facture.numero} — ${formatMoney(facture.montantTTC, currencySymbol)} ` +
        `(échéance ${formatDate(facture.dateEcheance)})`,
      link: `/facturation/factures/${facture.id}`,
      audience: {
        client: {
          user_id: (facture.client as any)?.user_id,
          email: (facture.client as any)?.email,
          notify: notifyClient,
        },
        lawyer_id: (facture.dossier as any)?.lawyer_id ?? null,
      },
      entity: { type: 'facture', id: facture.id },
      emailContext: buildEntityMailContext({
        dossier: facture.dossier as any,
        resourceType: 'facture',
        resource: facture as any,
      }),
    });
  }

  protected async onAfterUpdate(
    entity: Partial<Facture>,
    event: UpdateEvent<Facture>,
  ): Promise<void> {
    if (!this.hasColumnChanged(event, 'status')) return;

    const change = this.getFieldChanges(event, ['status']).find(
      (c) => c.field === 'status',
    );
    if (!change) return;

    const id = entity.id ?? (event.databaseEntity as Facture)?.id;
    if (!id) return;
    const facture = await this.load(id).catch(() => null);
    if (!facture) return;
    const notifyClient = this.resolveTransientBoolean(
      'notify_client',
      entity as any,
      event.databaseEntity as any,
      facture as any,
    );

    const newStatus = Number(change.newValue);
    let event_:
      | NotifiableEvent.FACTURE_PAID
      | NotifiableEvent.FACTURE_OVERDUE
      | null = null;
    let title = '';
    let statusLabel = '';
    if (newStatus === StatutFacture.PAYEE) {
      event_ = NotifiableEvent.FACTURE_PAID;
      title = `Facture ${facture.numero} payée`;
      statusLabel = 'PAYEE';
    } else if (newStatus === StatutFacture.IMPAYEE) {
      event_ = NotifiableEvent.FACTURE_OVERDUE;
      title = `Facture ${facture.numero} impayée`;
      statusLabel = 'IMPAYEE';
    }
    if (!event_) return;

    const currencySymbol = await this.getCurrencySymbol();

    this.logger.log(
      `📢 Facture statut changé | id=${facture.id} | numero=${facture.numero} | new_status=${statusLabel} | notify_client=${notifyClient}`,
    );

    await this.notify({
      event: event_,
      title,
      content: `Montant : ${formatMoney(facture.montantTTC, currencySymbol)}`,
      link: `/facturation/factures/${facture.id}`,
      audience: {
        client: {
          user_id: (facture.client as any)?.user_id,
          email: (facture.client as any)?.email,
          notify: notifyClient,
        },
        lawyer_id: (facture.dossier as any)?.lawyer_id ?? null,
      },
      entity: { type: 'facture', id: facture.id },
      changes: { status: { from: change.oldValue, to: change.newValue } },
      emailContext: buildEntityMailContext({
        dossier: facture.dossier as any,
        resourceType: 'facture',
        resource: facture as any,
      }),
    });
  }

  private load(id: string | number): Promise<Facture | null> {
    return this.factureRepo.findOne({
      where: { id: id as any },
      relations: ['client', 'dossier'],
    });
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
