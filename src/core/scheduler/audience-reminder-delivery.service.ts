import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { DataSource, In } from 'typeorm';
import { Audience, AudienceStatus } from 'src/modules/audiences/entities/audience.entity';
import { Notification } from 'src/modules/notification/entities/notification.entity';
import { UserNotification } from 'src/modules/notification/entities/user-notification.entity';
import {
  NotificationPriority,
  NotificationType,
} from 'src/modules/notification/enum/notification-type.enum';
import { User } from 'src/modules/iam/user/entities/user.entity';

interface AudienceReminderEvent {
  eventId: string;
  tenantId: number;
  idempotencyKey: string;
  audienceId: number;
  dossierId: number;
}

/**
 * Matérialise un rappel depuis l'outbox. Le journal de livraison et les
 * notifications sont écrits dans la même transaction : une reprise du worker
 * ne crée donc jamais un second rappel.
 */
@Injectable()
export class AudienceReminderDeliveryService {
  constructor(private readonly dataSource: DataSource) {}

  @OnEvent('outbox.audience.reminder.requested')
  async deliver(event: AudienceReminderEvent): Promise<void> {
    await this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      const existing = await manager.query(
        `SELECT status
         FROM audience_reminder_deliveries
         WHERE event_id = ? AND tenant_id = ?
         FOR UPDATE`,
        [event.eventId, event.tenantId],
      );
      if (existing[0]?.status === 'DELIVERED') return;

      const audience = await manager.findOne(Audience, {
        where: {
          id: Number(event.audienceId),
          tenant_id: Number(event.tenantId),
        },
        relations: ['dossier', 'dossier.collaborators'],
        lock: { mode: 'pessimistic_write' },
      });
      if (!audience) {
        throw new Error(`Audience ${event.audienceId} introuvable`);
      }
      if (audience.status !== AudienceStatus.SCHEDULED) {
        return;
      }
      if (audience.reminder_sent) {
        return;
      }

      const intendedRecipients = [
        audience.dossier?.lawyer_id,
        ...(audience.dossier?.collaborators?.map((member) => member.id) ?? []),
      ]
        .map(Number)
        .filter((id, index, all) =>
          Number.isInteger(id) && id > 0 && all.indexOf(id) === index,
        );
      if (intendedRecipients.length === 0) {
        throw new Error(
          `Audience ${audience.id}: aucun destinataire de rappel`,
        );
      }
      const tenantUsers = await manager.getRepository(User).find({
        where: {
          id: In(intendedRecipients),
          tenant_id: Number(event.tenantId),
        },
        select: ['id'],
      });
      const recipients = tenantUsers.map((user) => Number(user.id));
      if (recipients.length !== intendedRecipients.length) {
        throw new Error(
          `Audience ${audience.id}: destinataire absent ou étranger au cabinet`,
        );
      }

      await manager.query(
        `INSERT INTO audience_reminder_deliveries
           (event_id, tenant_id, audience_id, idempotency_key, status,
            recipient_count, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'PROCESSING', ?, UTC_TIMESTAMP(6), UTC_TIMESTAMP(6))
         ON DUPLICATE KEY UPDATE
           status = 'PROCESSING',
           recipient_count = VALUES(recipient_count),
           updated_at = UTC_TIMESTAMP(6)`,
        [
          event.eventId,
          event.tenantId,
          audience.id,
          event.idempotencyKey,
          recipients.length,
        ],
      );

      const notificationRepository = manager.getRepository(Notification);
      const notification = await notificationRepository.save(
        notificationRepository.create({
          tenant_id: event.tenantId,
          // Une notification système n'usurpe jamais l'utilisateur n°1,
          // qui peut appartenir à un autre cabinet.
          user_id: null,
          type: NotificationType.AUDIENCE_REMINDER,
          title: "Rappel d'audience",
          content:
            `Audience du dossier ` +
            `${audience.dossier?.dossier_number ?? audience.dossier_id} ` +
            `le ${audience.audience_date} à ${audience.audience_time}` +
            (audience.room ? ` (salle ${audience.room})` : ''),
          data: {
            audienceId: audience.id,
            dossierId: Number(audience.dossier_id),
            startsAtUtc: audience.starts_at_utc?.toISOString?.() ?? null,
            timezone: audience.timezone,
          },
          link: `/audiences/${audience.id}`,
          priority: NotificationPriority.HIGH,
          is_push_sent: false,
          actions: [],
        }),
      );
      const userNotificationRepository =
        manager.getRepository(UserNotification);
      await userNotificationRepository.save(
        recipients.map((userId) =>
          userNotificationRepository.create({
            tenant_id: event.tenantId,
            user_id: userId,
            notification_id: notification.id,
            is_read: false,
            is_archived: false,
            is_push_sent: false,
          }),
        ),
      );

      audience.reminder_sent = true;
      audience.reminder_sent_at = new Date();
      await manager.save(audience);
      await manager.query(
        `UPDATE audience_reminder_deliveries
         SET status = 'DELIVERED',
             notification_id = ?,
             delivered_at = UTC_TIMESTAMP(6),
             updated_at = UTC_TIMESTAMP(6),
             last_error = NULL
         WHERE event_id = ? AND tenant_id = ?`,
        [notification.id, event.eventId, event.tenantId],
      );
    });
  }
}
