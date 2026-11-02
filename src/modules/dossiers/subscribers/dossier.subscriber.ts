import { DossierStatus } from 'src/core/enums/dossier-status.enum';
import { NotificationDispatcher } from 'src/core/notifications/notification-dispatcher.service';
import { NotifiableEvent } from 'src/core/notifications/notification-events.enum';
import { NotifiableSubscriber } from 'src/core/subscribers/notifiable.subscriber';
import { buildEntityMailContext } from 'src/modules/mail-template/mail-variables';
import { DataSource, InsertEvent, UpdateEvent } from 'typeorm';
import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { Dossier } from '../entities/dossier.entity';
import { DossierChatSyncService } from '../dossier-chat-sync.service';

/**
 * Subscriber métier pour l'entité Dossier.
 *
 * Effets gérés automatiquement :
 *  1. Création d'un dossier → crée son chat (avocat référent,
 *     collaborateurs, auteur) et l'associe via dossier.conversation_id.
 *
 *  2. Mise à jour → le chat est réaligné sur les membres du dossier
 *     (ajouts et retraits, cf. DossierChatSyncService).
 *
 *  Les notifications sont émises après commit depuis l'outbox.
 *
 * Pour ajouter un nouvel effet de bord :
 *   - Surcharge onAfterCreate ou onAfterUpdate
 *   - Utilise hasColumnChanged / hasRelationChanged / getFieldChanges
 */
@Injectable()
export class DossierSubscriber extends NotifiableSubscriber<Dossier> {
  constructor(
    dataSource: DataSource,
    notificationDispatcher: NotificationDispatcher,
    private readonly dossierChatSync: DossierChatSyncService,
  ) {
    super(dataSource, notificationDispatcher);
  }

  listenTo() {
    return Dossier;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // CRÉATION
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Après la création d'un dossier :
   *  - Crée une conversation de groupe nommée d'après le numéro de dossier
   *  - Ajoute l'avocat référent comme participant initial
   *  - Lie la conversation au dossier via conversation_id (QueryBuilder pour
   *    éviter de re-déclencher le subscriber)
   */
  protected async onAfterCreate(
    entity: Dossier,
    event: InsertEvent<Dossier>,
  ): Promise<void> {
    try {
      await this.createConversation(entity, event);
    } catch (err) {
      this.logger.error(
        `createConversation a échoué pour le dossier ${entity.dossier_number} : ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  @OnEvent('outbox.dossier.created')
  async handleDossierCreatedOutbox(payload: {
    dossierId: number;
    notifyClient?: boolean;
  }): Promise<void> {
    const dossier = await this.load(Number(payload.dossierId));
    if (!dossier) return;
    await this.notifyDossierCreated(
      dossier,
      undefined,
      payload.notifyClient === true,
    );
  }

  /**
   * Déclenche les notifications de création de dossier via le dispatcher central.
   *  - Client       → e-mail si entity.notify_client === true (case cochée dans le modal)
   *  - Avocat       → in-app + e-mail selon ses préférences
   *  - Collabs      → in-app + e-mail selon leurs préférences
   *  - Admins       → toujours (résolus par le dispatcher via role.code = 'admin')
   */
  private async notifyDossierCreated(
    entity: Dossier,
    event?: InsertEvent<Dossier>,
    notifyClientOverride?: boolean,
  ): Promise<void> {
    // Recharger les relations utiles si pas encore en mémoire
    const loaded = await this.load(entity.id, event).catch(() => null);
    const dossier = loaded ?? entity;
    if (!dossier) return;

    const clientUserId =
      (dossier.client as any)?.user_id ?? (dossier.client as any)?.user?.id;
    const clientEmail = (dossier.client as any)?.email;
    const notifyClient =
      notifyClientOverride ??
      this.resolveTransientBoolean('notify_client', entity, dossier as any);

    this.logger.log(
      `📢 Dossier créé | id=${dossier.id} | number="${dossier.dossier_number}" | lawyer=${dossier.lawyer_id ?? '?'} | client.user_id=${clientUserId ?? '?'} | notify_client=${notifyClient}`,
    );

    await this.notify({
      event: NotifiableEvent.DOSSIER_CREATED,
      title: `Nouveau dossier ${dossier.dossier_number}`,
      content: dossier.object?.trim() || `Dossier ${dossier.dossier_number} créé`,
      link: `/dossiers/${dossier.id}`,
      audience: {
        client: {
          user_id: clientUserId,
          email: clientEmail,
          notify: notifyClient,
        },
        lawyer_id: dossier.lawyer_id ?? null,
        collaborator_ids: (dossier.collaborators ?? [])
          .map((c) => (c as any).user_id ?? (c as any).user?.id ?? c.id)
          .filter(Boolean),
      },
      entity: { type: 'dossier', id: dossier.id },
      emailContext: buildEntityMailContext({
        dossier,
        resourceType: 'dossier',
        resource: dossier as any,
      }),
    });
  }

  /**
   * Chat du dossier (avocat, collaborateurs, auteur). Via event.manager →
   * même transaction que l'insertion : un rollback annule aussi la
   * conversation (pas d'orphelin).
   */
  private async createConversation(
    entity: Dossier,
    event: InsertEvent<Dossier>,
  ): Promise<void> {
    const result = await this.dossierChatSync.sync(entity.id, event.manager, {
      notifyAdded: false,
    });
    if (result) entity.conversation_id = result.conversationId;
  }


  // ────────────────────────────────────────────────────────────────────────────
  // MISE À JOUR
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Après une mise à jour du dossier :
   *  - Si la relation `collaborators` a changé → synchronise les participants
   *    de la conversation (ajout uniquement, pas de suppression automatique)
   *  - Extensible : ajoute d'autres blocs conditionnels pour d'autres champs
   */
  protected async onAfterUpdate(
    entity: Partial<Dossier>,
    event: UpdateEvent<Dossier>,
  ): Promise<void> {
    const dossierId = entity.id ?? event.databaseEntity?.id;
    if (!dossierId) return;
    try {
      await this.dossierChatSync.sync(dossierId, event.manager);
    } catch (err) {
      this.logger.error(
        `Synchro du chat du dossier #${dossierId} : ${(err as Error).message}`,
      );
    }
  }

  @OnEvent('outbox.dossier.activated')
  async handleDossierActivated(payload: any): Promise<void> {
    await this.notifyLifecycleStatusChange(payload);
  }

  @OnEvent('outbox.dossier.closed')
  async handleDossierClosed(payload: any): Promise<void> {
    await this.notifyLifecycleStatusChange(payload);
  }

  @OnEvent('outbox.dossier.reopened')
  async handleDossierReopened(payload: any): Promise<void> {
    await this.notifyLifecycleStatusChange(payload);
  }

  @OnEvent('outbox.dossier.archived')
  async handleDossierArchived(payload: any): Promise<void> {
    await this.notifyLifecycleStatusChange(payload);
  }

  private async notifyLifecycleStatusChange(payload: {
    dossierId: number;
    fromStatus?: DossierStatus;
    toStatus?: DossierStatus;
    notifyClient?: boolean;
  }): Promise<void> {
    const dossier = await this.load(Number(payload.dossierId));
    if (!dossier || !payload.fromStatus || !payload.toStatus) return;
    const oldLabel = labelStatus(payload.fromStatus);
    const newLabel = labelStatus(payload.toStatus);
    await this.notify({
      event: NotifiableEvent.DOSSIER_STATUS_CHANGED,
      title: `Statut du dossier ${dossier.dossier_number} mis à jour`,
      content: `Passage de "${oldLabel}" à "${newLabel}"`,
      link: `/dossiers/${dossier.id}`,
      audience: {
        client: {
          user_id: (dossier.client as any)?.user_id,
          email: (dossier.client as any)?.email,
          notify: payload.notifyClient === true,
        },
        lawyer_id: dossier.lawyer_id ?? null,
        collaborator_ids: (dossier.collaborators ?? [])
          .map((collaborator) =>
            (collaborator as any).user_id ??
            (collaborator as any).user?.id,
          )
          .filter(Boolean),
      },
      entity: { type: 'dossier', id: dossier.id },
      changes: {
        status: {
          from: payload.fromStatus,
          to: payload.toStatus,
        },
      },
      emailContext: buildEntityMailContext({
        dossier,
        resourceType: 'dossier',
        resource: dossier as any,
      }),
    });
  }

  // ── Helpers de rechargement (pattern uniformisé avec DiligenceSubscriber) ──

  private load(
    id: number,
    event?: InsertEvent<Dossier> | UpdateEvent<Dossier>,
  ): Promise<Dossier | null> {
    return this.loadEntity<Dossier>(id, {
      relations: ['client', 'lawyer', 'collaborators'],
    }, event);
  }

}

/** Étiquette lisible pour le cycle administratif du dossier. */
function labelStatus(v: any): string {
  switch (v) {
    case DossierStatus.DRAFT: return 'Brouillon';
    case DossierStatus.ACTIVE: return 'Actif';
    case DossierStatus.CLOSED: return 'Clôturé';
    case DossierStatus.ARCHIVED: return 'Archivé';
    default: return String(v ?? '');
  }
}
