import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, InsertEvent, Repository, UpdateEvent } from 'typeorm';

import { Facture } from '../entities/facture.entity';
import { StatutFacture } from '../dto/create-facture.dto';
import { NotifiableSubscriber } from 'src/core/subscribers/notifiable.subscriber';
import { NotificationDispatcher } from 'src/core/notifications/notification-dispatcher.service';
import { NotifiableEvent } from 'src/core/notifications/notification-events.enum';

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
  ) {
    super(dataSource, notificationDispatcher);
  }

  listenTo() {
    return Facture;
  }

  protected async onAfterCreate(
    entity: Facture,
    _event: InsertEvent<Facture>,
  ): Promise<void> {
    const facture = await this.loadWithRelations(entity.id);
    if (!facture) return;

    await this.notify({
      event: NotifiableEvent.FACTURE_CREATED,
      title: `Nouvelle facture ${facture.numero}`,
      content:
        `Facture ${facture.numero} — ${formatMoney(facture.montantTTC)} ` +
        `(échéance ${formatDate(facture.dateEcheance)})`,
      link: `/facturation/factures/${facture.id}`,
      audience: {
        client: {
          user_id: (facture.client as any)?.user_id,
          email: (facture.client as any)?.email,
          notify: !!entity.notify_client,
        },
        lawyer_id: (facture.dossier as any)?.lawyer_id ?? null,
      },
      entity: { type: 'facture', id: facture.id },
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
    const facture = await this.loadWithRelations(id);
    if (!facture) return;

    const newStatus = Number(change.newValue);
    let event_:
      | NotifiableEvent.FACTURE_PAID
      | NotifiableEvent.FACTURE_OVERDUE
      | null = null;
    let title = '';
    if (newStatus === StatutFacture.PAYEE) {
      event_ = NotifiableEvent.FACTURE_PAID;
      title = `Facture ${facture.numero} payée`;
    } else if (newStatus === StatutFacture.IMPAYEE) {
      event_ = NotifiableEvent.FACTURE_OVERDUE;
      title = `Facture ${facture.numero} impayée`;
    }
    if (!event_) return;

    await this.notify({
      event: event_,
      title,
      content: `Montant : ${formatMoney(facture.montantTTC)}`,
      link: `/facturation/factures/${facture.id}`,
      audience: {
        client: {
          user_id: (facture.client as any)?.user_id,
          email: (facture.client as any)?.email,
          notify: !!(entity as Facture).notify_client,
        },
        lawyer_id: (facture.dossier as any)?.lawyer_id ?? null,
      },
      entity: { type: 'facture', id: facture.id },
      changes: { status: { from: change.oldValue, to: change.newValue } },
    });
  }

  private loadWithRelations(id: string | number): Promise<Facture | null> {
    return this.factureRepo.findOne({
      where: { id: id as any },
      relations: ['client', 'dossier'],
    });
  }
}

function formatMoney(v: any): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v ?? '');
  return `${n.toLocaleString('fr-FR')} FCFA`;
}

function formatDate(v: any): string {
  if (!v) return '';
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime())
    ? String(v)
    : d.toLocaleDateString('fr-FR');
}
