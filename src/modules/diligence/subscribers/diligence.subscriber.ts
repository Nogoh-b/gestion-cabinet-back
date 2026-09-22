import { NotificationDispatcher } from 'src/core/notifications/notification-dispatcher.service';
import { NotifiableEvent } from 'src/core/notifications/notification-events.enum';
import { NotifiableSubscriber } from 'src/core/subscribers/notifiable.subscriber';
import { buildEntityMailContext } from 'src/modules/mail-template/mail-variables';
import { DataSource, EntityManager, InsertEvent, UpdateEvent } from 'typeorm';
import { Injectable } from '@nestjs/common';

import { Diligence, DiligenceStatus } from '../entities/diligence.entity';
import { DossierAction } from '../../case-workflow/entities/dossier-action.entity';
import { CaseWorkflowEvent } from '../../case-workflow/entities/workflow-audit.entity';

/**
 * Subscriber métier pour les diligences.
 *
 * Événements émis :
 *  - DILIGENCE_ASSIGNED  → à la création (l'avocat assigné est notifié)
 *  - DILIGENCE_COMPLETED → quand status passe à COMPLETED
 */
@Injectable()
export class DiligenceSubscriber extends NotifiableSubscriber<Diligence> {
  constructor(
    dataSource: DataSource,
    notificationDispatcher: NotificationDispatcher,
  ) {
    super(dataSource, notificationDispatcher);
  }

  listenTo() {
    return Diligence;
  }

  protected async onAfterCreate(
    entity: Diligence,
    event: InsertEvent<Diligence>,
  ): Promise<void> {
    // Tentative de rechargement avec les relations (dossier, client, avocat).
    // Si le findOne échoue (ex. contexte transactionnel ou filtre tenant),
    // on utilise les champs scalaires de l'entité passée en paramètre.
    const loaded = await this.load(entity.id, event).catch(() => null);
    const diligence = loaded ?? entity;
    // En fallback (loaded === null), le dossier n'est pas chargé via la relation,
    // on utilise un objet partiel avec au moins l'id pour le lien.
    const dossier: any = diligence.dossier ?? (diligence.dossier_id ? { id: diligence.dossier_id } : null);
    const notifyClient = this.resolveTransientBoolean(
      'notify_client',
      entity,
      diligence as any,
    );

    this.logger.log(
      `📢 Diligence créée | id=${diligence.id} | title="${diligence.title}" | dossier=${dossier?.id ?? '?'} | lawyer=${diligence.assigned_lawyer_id ?? '?'} | notify_client=${notifyClient} | description="${diligence.description?.trim() || '(vide)'}"`,
    );

    await this.notify({
      event: NotifiableEvent.DILIGENCE_ASSIGNED,
      title: `Nouvelle diligence — ${diligence.title}`,
      content: diligence.description?.trim() || `Diligence assignée`,
      link: diligence.source_action_id
        ? `/dossiers/${dossier?.id ?? diligence.dossier_id}?tab=steps#action-${diligence.source_action_id}`
        : `/dossiers/diligences/${diligence.id}`,
      audience: {
        client: {
          user_id: (dossier?.client as any)?.user_id,
          email: (dossier?.client as any)?.email,
          notify: notifyClient,
        },
        // L'avocat assigné peut être différent de l'avocat principal du dossier
        lawyer_id: diligence.assigned_lawyer_id ?? dossier?.lawyer_id ?? null,
      },
      entity: { type: 'diligence', id: diligence.id },
      emailContext: buildEntityMailContext({
        dossier,
        resourceType: 'diligence',
        resource: diligence as any,
        action: await this.loadSourceActionContext(event.manager, diligence),
      }),
    });
  }

  protected async onAfterUpdate(
    entity: Partial<Diligence>,
    event: UpdateEvent<Diligence>,
  ): Promise<void> {
    if (!this.hasColumnChanged(event, 'status')) return;
    const change = this.getFieldChanges(event, ['status']).find(
      (c) => c.field === 'status',
    );
    if (!change || change.newValue !== DiligenceStatus.COMPLETED) return;

    const id = entity.id ?? (event.databaseEntity as Diligence)?.id;
    if (!id) return;
    const diligence = await this.load(id, event).catch(() => null);
    if (!diligence) return;
    const dossier: any = diligence.dossier;
    const notifyClient = this.resolveTransientBoolean(
      'notify_client',
      entity as any,
      event.databaseEntity as any,
      diligence as any,
    );

    await this.notify({
      event: NotifiableEvent.DILIGENCE_COMPLETED,
      title: `Diligence terminée — ${diligence.title}`,
      content: 'La diligence a été marquée comme terminée.',
      link: `/dossiers/${dossier?.id ?? ''}/diligences/${diligence.id}`,
      audience: {
        client: {
          user_id: (dossier?.client as any)?.user_id,
          email: (dossier?.client as any)?.email,
          notify: notifyClient,
        },
        lawyer_id: diligence.assigned_lawyer_id ?? dossier?.lawyer_id ?? null,
      },
      entity: { type: 'diligence', id: diligence.id },
      emailContext: buildEntityMailContext({
        dossier,
        resourceType: 'diligence',
        resource: diligence as any,
        action: await this.loadSourceActionContext(event.manager, diligence),
      }),
    });
  }

  /**
   * Charge l'action de dossier a l'origine de la diligence (si liee) avec
   * son historique de reports d'echeance, pour alimenter le namespace
   * action.* des templates d'e-mail. Ne doit jamais faire echouer la
   * notification : toute erreur retourne undefined.
   */
  private async loadSourceActionContext(
    manager: EntityManager,
    diligence: Diligence,
  ): Promise<Record<string, any> | undefined> {
    try {
      if (!diligence.source_action_id) return undefined;
      const tenantId = (diligence as any).tenant_id;
      const action = await manager.getRepository(DossierAction).findOne({
        where: { id: diligence.source_action_id, tenant_id: tenantId },
      });
      if (!action) return undefined;
      const events = await manager.getRepository(CaseWorkflowEvent).find({
        where: {
          tenant_id: tenantId,
          aggregate_type: 'DossierAction',
          aggregate_id: diligence.source_action_id,
          event_type: 'DOSSIER_ACTION_DEADLINE_EXTENDED',
        },
        order: { created_at: 'ASC' },
      });
      const history = events.map((e) => ({
        date: (e as any).created_at,
        previousDueAt: (e.payload as any)?.previousDueAt ?? null,
        dueAt: (e.payload as any)?.dueAt ?? null,
        reason: (e.payload as any)?.reason ?? null,
      }));
      return {
        ...(action as any),
        deadlineExtensions: { count: history.length, history },
      };
    } catch {
      return undefined;
    }
  }

  private load(
    id: number,
    event?: InsertEvent<Diligence> | UpdateEvent<Diligence>,
  ): Promise<Diligence | null> {
    return this.loadEntity<Diligence>(id, {
      relations: ['dossier', 'dossier.client', 'assigned_lawyer'],
    }, event);
  }
}
