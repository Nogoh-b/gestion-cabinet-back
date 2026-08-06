import { NotificationDispatcher } from 'src/core/notifications/notification-dispatcher.service';
import { NotifiableEvent } from 'src/core/notifications/notification-events.enum';
import { NotifiableSubscriber } from 'src/core/subscribers/notifiable.subscriber';
import { buildEntityMailContext } from 'src/modules/mail-template/mail-variables';
import { DataSource, InsertEvent, UpdateEvent } from 'typeorm';
import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { Audience } from '../entities/audience.entity';

/**
 * Subscriber métier pour les audiences.
 *
 * Événements émis :
 *  - AUDIENCE_CREATED → à la création
 *  - AUDIENCE_HELD    → quand status passe à HELD (tenue)
 *  - AUDIENCE_UPDATED → autre changement notable (postponed_to, judge, room)
 *
 * Le service historique refuse désormais `sendEmails()` ; les e-mails
 * « riches » avec pièces jointes ; ce subscriber dispatche les notifications
 * légères (in-app + e-mail récap) via le NotificationDispatcher.
 */
@Injectable()
export class AudienceSubscriber extends NotifiableSubscriber<Audience> {
  constructor(
    dataSource: DataSource,
    notificationDispatcher: NotificationDispatcher,
  ) {
    super(dataSource, notificationDispatcher);
  }

  listenTo() {
    return Audience;
  }

  protected async onAfterCreate(
    entity: Audience,
    event?: InsertEvent<Audience>,
  ): Promise<void> {
    if (event) return;
    const loaded = await this.load(entity.id, event).catch(() => null);
    const audience = loaded ?? entity;
    if (!audience) return;
    const dossier: any = audience.dossier;
    const client: any = dossier?.client;
    const notifyClient = this.resolveTransientBoolean('notify_client', entity, audience as any);

    this.logger.log(
      `📢 Audience créée | id=${audience.id} | date=${formatDate(audience.audience_date)} | dossier=${dossier?.dossier_number ?? '?'} | notify_client=${notifyClient}`,
    );

    await this.notify({
      event: NotifiableEvent.AUDIENCE_CREATED,
      title: `Nouvelle audience — dossier ${dossier?.dossier_number ?? ''}`,
      content:
        `Audience prévue le ${formatDate(audience.audience_date)}` +
        (audience.audience_time ? ` à ${audience.audience_time}` : '') +
        (audience.room ? ` (${audience.room})` : ''),
      link: `/audiences/${audience.id}`,
      audience: {
        client: {
          user_id: client?.user_id,
          email: client?.email,
          notify: notifyClient,
        },
        lawyer_id: dossier?.lawyer_id ?? null,
        collaborator_ids: (dossier?.collaborators ?? [])
          .map((c: any) => c.user_id ?? c.user?.id)
          .filter(Boolean),
      },
      entity: { type: 'audience', id: audience.id },
      emailContext: buildEntityMailContext({
        dossier,
        resourceType: 'audience',
        resource: audience as any,
      }),
    });
  }

  protected async onAfterUpdate(
    entity: Partial<Audience>,
    event: UpdateEvent<Audience>,
  ): Promise<void> {
    void entity;
    void event;
  }

  @OnEvent('outbox.audience.created')
  async handleAudienceCreated(payload: {
    audienceId: number;
    notifyClient?: boolean;
  }): Promise<void> {
    const audience = await this.load(Number(payload.audienceId));
    if (!audience) return;
    (audience as any).notify_client = payload.notifyClient === true;
    await this.onAfterCreate(audience);
  }

  @OnEvent('outbox.audience.held')
  async handleAudienceHeld(payload: {
    audienceId: number;
    notifyClient?: boolean;
  }): Promise<void> {
    await this.dispatchHeld(
      Number(payload.audienceId),
      payload.notifyClient === true,
    );
  }

  @OnEvent('outbox.audience.updated')
  async handleAudienceUpdated(payload: {
    audienceId: number;
    notifyClient?: boolean;
  }): Promise<void> {
    await this.dispatchUpdated(
      Number(payload.audienceId),
      'Mise à jour d’audience',
      payload.notifyClient === true,
    );
  }

  @OnEvent('outbox.audience.rescheduled')
  async handleAudienceRescheduled(payload: {
    audienceId: number;
    notifyClient?: boolean;
  }): Promise<void> {
    await this.dispatchUpdated(
      Number(payload.audienceId),
      'Reprogrammation d’audience',
      payload.notifyClient === true,
    );
  }

  @OnEvent('outbox.audience.postponed')
  async handleAudiencePostponed(payload: {
    audienceId: number;
    notifyClient?: boolean;
  }): Promise<void> {
    await this.dispatchUpdated(
      Number(payload.audienceId),
      'Report d’audience',
      payload.notifyClient === true,
    );
  }

  @OnEvent('outbox.audience.cancelled')
  async handleAudienceCancelled(payload: {
    audienceId: number;
    notifyClient?: boolean;
  }): Promise<void> {
    await this.dispatchUpdated(
      Number(payload.audienceId),
      'Annulation d’audience',
      payload.notifyClient === true,
    );
  }

  private async dispatchHeld(
    id: number,
    notifyClient: boolean,
  ): Promise<void> {
    const audience = await this.load(id).catch(() => null);
    if (!audience) return;
    const dossier: any = audience.dossier;

    this.logger.log(
      `📢 Audience tenue | id=${audience.id} | date=${formatDate(audience.audience_date)} | dossier=${dossier?.dossier_number ?? '?'}`,
    );

    await this.notify({
      event: NotifiableEvent.AUDIENCE_HELD,
      title: `Audience tenue — dossier ${dossier?.dossier_number ?? ''}`,
      content: `L'audience du ${formatDate(audience.audience_date)} s'est tenue.`,
      link: `/audiences/${audience.id}`,
      audience: {
        client: {
          user_id: (dossier?.client as any)?.user_id,
          email: (dossier?.client as any)?.email,
          notify: notifyClient,
        },
        lawyer_id: dossier?.lawyer_id ?? null,
        collaborator_ids: (dossier?.collaborators ?? [])
          .map((c: any) => c.user_id ?? c.user?.id)
          .filter(Boolean),
      },
      entity: { type: 'audience', id: audience.id },
      emailContext: buildEntityMailContext({
        dossier,
        resourceType: 'audience',
        resource: audience as any,
      }),
    });
  }

  private async dispatchUpdated(
    id: number,
    reason: string,
    notifyClient: boolean,
  ): Promise<void> {
    const audience = await this.load(id).catch(() => null);
    if (!audience) return;
    const dossier: any = audience.dossier;

    this.logger.log(
      `📢 Audience modifiée | id=${audience.id} | reason="${reason}" | dossier=${dossier?.dossier_number ?? '?'}`,
    );

    await this.notify({
      event: NotifiableEvent.AUDIENCE_UPDATED,
      title: `${reason} — dossier ${dossier?.dossier_number ?? ''}`,
      content:
        audience.postponed_to
          ? `Reportée au ${formatDate(audience.postponed_to)}`
          : `Audience modifiée le ${formatDate(audience.audience_date)}`,
      link: `/audiences/${audience.id}`,
      audience: {
        client: {
          user_id: (dossier?.client as any)?.user_id,
          email: (dossier?.client as any)?.email,
          notify: notifyClient,
        },
        lawyer_id: dossier?.lawyer_id ?? null,
        collaborator_ids: (dossier?.collaborators ?? [])
          .map((c: any) => c.user_id ?? c.user?.id)
          .filter(Boolean),
      },
      entity: { type: 'audience', id: audience.id },
      emailContext: buildEntityMailContext({
        dossier,
        resourceType: 'audience',
        resource: audience as any,
      }),
    });
  }

  private load(
    id: number,
    event?: InsertEvent<Audience> | UpdateEvent<Audience>,
  ): Promise<Audience | null> {
    return this.loadEntity<Audience>(id, {
      relations: ['dossier', 'dossier.client', 'dossier.collaborators'],
    }, event);
  }
}

function formatDate(v: any): string {
  if (!v) return '';
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime())
    ? String(v)
    : d.toLocaleDateString('fr-FR');
}
