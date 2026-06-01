import { NotificationDispatcher } from 'src/core/notifications/notification-dispatcher.service';
import { NotifiableEvent } from 'src/core/notifications/notification-events.enum';
import { NotifiableSubscriber } from 'src/core/subscribers/notifiable.subscriber';
import { DataSource, InsertEvent, Repository, UpdateEvent } from 'typeorm';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { Diligence, DiligenceStatus } from '../entities/diligence.entity';

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
    @InjectRepository(Diligence)
    private readonly diligenceRepo: Repository<Diligence>,
  ) {
    super(dataSource, notificationDispatcher);
  }

  listenTo() {
    return Diligence;
  }

  protected async onAfterCreate(
    entity: Diligence,
    _event: InsertEvent<Diligence>,
  ): Promise<void> {
    // Tentative de rechargement avec les relations (dossier, client, avocat).
    // Si le findOne échoue (ex. contexte transactionnel ou filtre tenant),
    // on utilise les champs scalaires de l'entité passée en paramètre.
    const loaded = await this.load(entity.id).catch(() => null);
    const diligence = loaded ?? entity;
    // En fallback (loaded === null), le dossier n'est pas chargé via la relation,
    // on utilise un objet partiel avec au moins l'id pour le lien.
    const dossier: any = diligence.dossier ?? (diligence.dossier_id ? { id: diligence.dossier_id } : null);

    this.logger.log(
      `📢 Diligence créée | id=${diligence.id} | title="${diligence.title}" | dossier=${dossier?.id ?? '?'} | lawyer=${diligence.assigned_lawyer_id ?? '?'} | notify_client=${!!entity.notify_client} | description="${diligence.description?.trim() || '(vide)'}"`,
    );

    await this.notify({
      event: NotifiableEvent.DILIGENCE_ASSIGNED,
      title: `Nouvelle diligence — ${diligence.title}`,
      content: diligence.description?.trim() || `Diligence assignée`,
      link: `/dossiers/${dossier?.id ?? ''}/diligences/${diligence.id}`,
      audience: {
        client: {
          user_id: (dossier?.client as any)?.user_id,
          email: (dossier?.client as any)?.email,
          notify: !!entity.notify_client,
        },
        // L'avocat assigné peut être différent de l'avocat principal du dossier
        lawyer_id: diligence.assigned_lawyer_id ?? dossier?.lawyer_id ?? null,
      },
      entity: { type: 'diligence', id: diligence.id },
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
    const diligence = await this.load(id);
    if (!diligence) return;
    const dossier: any = diligence.dossier;

    await this.notify({
      event: NotifiableEvent.DILIGENCE_COMPLETED,
      title: `Diligence terminée — ${diligence.title}`,
      content: 'La diligence a été marquée comme terminée.',
      link: `/dossiers/${dossier?.id ?? ''}/diligences/${diligence.id}`,
      audience: {
        client: {
          user_id: (dossier?.client as any)?.user_id,
          email: (dossier?.client as any)?.email,
          notify: !!(entity as Diligence).notify_client,
        },
        lawyer_id: diligence.assigned_lawyer_id ?? dossier?.lawyer_id ?? null,
      },
      entity: { type: 'diligence', id: diligence.id },
    });
  }

  private load(id: number): Promise<Diligence | null> {
    return this.diligenceRepo.findOne({
      where: { id },
      relations: ['dossier', 'dossier.client', 'assigned_lawyer'],
    });
  }
}
