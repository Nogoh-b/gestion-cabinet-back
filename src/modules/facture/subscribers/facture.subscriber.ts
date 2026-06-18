import { NotificationDispatcher } from 'src/core/notifications/notification-dispatcher.service';
import { NotifiableEvent } from 'src/core/notifications/notification-events.enum';
import { NotifiableSubscriber } from 'src/core/subscribers/notifiable.subscriber';
import { getCurrentTenantId } from 'src/core/tenant/tenant.context';
import { Cabinet } from 'src/modules/cabinet/entities/cabinet.entity';
import { buildEntityMailContext } from 'src/modules/mail-template/mail-variables';
import { DataSource, InsertEvent, RemoveEvent, Repository, UpdateEvent } from 'typeorm';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { StatutFacture } from '../dto/create-facture.dto';
import { Facture } from '../entities/facture.entity';

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
    @InjectRepository(Cabinet)
    private readonly cabinetRepo: Repository<Cabinet>,
  ) {
    super(dataSource, notificationDispatcher);
  }

  /** Symbole de la devise active (ex: "FCFA", "€"). */
  private async getCurrencySymbol(): Promise<string> {
    const cabinet = await this.cabinetRepo.findOne({ where: { id: getCurrentTenantId() } }).catch(() => null);
    return cabinet?.currency_symbol ?? cabinet?.currency ?? 'XAF';
  }

  listenTo() {
    return Facture; 
  }

  protected async onAfterCreate(
    entity: Facture,
    event: InsertEvent<Facture>,
  ): Promise<void> {
    // const facture = await this.load(entity.id);
    const loaded = await this.load(entity.id, event).catch(() => null);
    const facture = loaded ?? entity;
    if (!facture) return;

    // Resync actual_costs on parent dossier
    await this.syncDossierActualCosts(facture.dossier_id ?? (facture.dossier as any)?.id, event);

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
    // Resync actual_costs if montantTTC changed (or as a safe catch-all)
    const dossierId =
      (entity as any).dossier_id ?? (event.databaseEntity as any)?.dossier_id;
    await this.syncDossierActualCosts(dossierId, event);

    if (!this.hasColumnChanged(event, 'status')) return;

    const change = this.getFieldChanges(event, ['status']).find(
      (c) => c.field === 'status',
    );
    if (!change) return;

    const id = entity.id ?? (event.databaseEntity as Facture)?.id;
    if (!id) return;
    const facture = await this.load(id, event).catch(() => null);
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

  protected async onAfterRemove(
    entity: Facture,
    event: RemoveEvent<Facture>,
  ): Promise<void> {
    await this.syncDossierActualCosts((entity as any).dossier_id, event);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private load(
    id: string | number,
    event?: InsertEvent<Facture> | UpdateEvent<Facture>,
  ): Promise<Facture | null> {
    return this.loadEntity<Facture>(id, {
      relations: ['client', 'dossier'],
    }, event);
  }

  /**
   * Recalcule et persiste actual_costs sur le dossier parent.
   * Appelé après chaque INSERT / UPDATE / DELETE de facture pour garder
   * la colonne synchrone avec la réalité (nécessaire pour les requêtes
   * SQL d'agrégat dans DossierStatsService : SUM(actual_costs), AVG…).
   */
  private async syncDossierActualCosts(
    dossierId: number | string | undefined,
    event?: InsertEvent<Facture> | UpdateEvent<Facture> | RemoveEvent<Facture>,
  ): Promise<void> {
    if (!dossierId) return;
    try {
      await (event?.manager ?? this.dataSource.manager).query(
        `UPDATE dossiers
         SET actual_costs = COALESCE(
           (SELECT SUM(f.montant_ttc)
            FROM factures f
            WHERE f.dossier_id = ? AND f.deleted_at IS NULL),
           0
         )
         WHERE id = ?`,
        [dossierId, dossierId],
      );
      this.logger.log(`💰 actual_costs mis à jour | dossier #${dossierId}`);
    } catch (err) {
      this.logger.error(
        `syncDossierActualCosts(${dossierId}): ${(err as Error).message}`,
      );
    }
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
