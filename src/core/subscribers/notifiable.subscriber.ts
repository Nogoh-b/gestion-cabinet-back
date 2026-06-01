import { DataSource, ObjectLiteral } from 'typeorm';
import { BaseEntitySubscriber } from './base-entity.subscriber';
import {
  DispatchPayload,
  NotificationDispatcher,
} from '../notifications/notification-dispatcher.service';

/**
 * Base class pour tout subscriber qui veut déclencher des notifications.
 *
 * Différences vs `BaseEntitySubscriber` :
 *  - injecte `NotificationDispatcher`
 *  - fournit `notify()` qui n'échoue jamais (le dispatcher swallow ses erreurs)
 *
 * Usage type dans un subscriber métier :
 *
 *   protected async onAfterCreate(entity, event) {
 *     await this.notify({
 *       event: NotifiableEvent.DOSSIER_CREATED,
 *       title: `Nouveau dossier ${entity.dossier_number}`,
 *       content: entity.object,
 *       link: `/dossiers/${entity.id}`,
 *       audience: {
 *         client: { user_id: entity.client?.user_id, notify: !!(entity as any).notify_client },
 *         lawyer_id: entity.lawyer_id,
 *         collaborator_ids: (entity.collaborators ?? []).map(c => c.user_id),
 *       },
 *       entity: { type: 'dossier', id: entity.id },
 *     });
 *   }
 */
export abstract class NotifiableSubscriber<
  T extends ObjectLiteral,
> extends BaseEntitySubscriber<T> {
  constructor(
    dataSource: DataSource,
    protected readonly notificationDispatcher: NotificationDispatcher,
  ) {
    super(dataSource);
  }

  /**
   * Helper unique pour déclencher une notification depuis un hook
   * (`onAfterCreate` / `onAfterUpdate`).
   *
   * Ne re-throw jamais : si la cible est mal résolue ou si le mail tombe,
   * le subscriber et donc la transaction métier ne sont pas impactés.
   */
  protected async notify(payload: DispatchPayload): Promise<void> {
    try {
      await this.notificationDispatcher.dispatch(payload);
    } catch (err) {
      this.logger.error(
        `notify(${payload.event}) ignoré : ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  // Les hooks `onAfterCreate` / `onAfterUpdate` sont hérités de
  // `BaseEntitySubscriber` (no-op par défaut). À surcharger dans la classe
  // fille pour brancher des notify().
}
