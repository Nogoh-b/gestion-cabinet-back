import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { DataSource, In } from 'typeorm';
import { User } from 'src/modules/iam/user/entities/user.entity';
import { Notification } from 'src/modules/notification/entities/notification.entity';
import { UserNotification } from 'src/modules/notification/entities/user-notification.entity';
import {
  NotificationPriority,
  NotificationType,
} from 'src/modules/notification/enum/notification-type.enum';
import {
  LegalDeadline,
  LegalDeadlineStatus,
} from './entities/legal-deadline.entity';

interface LegalDeadlineWarningEvent {
  eventId: string;
  tenantId: number;
  idempotencyKey: string;
  deadlineId: number;
  dossierId: number;
  audienceId: number;
  offsetDays: number;
  dueAtUtc: string;
}

@Injectable()
export class LegalDeadlineWarningListener {
  constructor(private readonly dataSource: DataSource) {}

  @OnEvent('outbox.legal_deadline.warning_due')
  async deliver(event: LegalDeadlineWarningEvent): Promise<void> {
    await this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      const existing = await manager.query(
        `SELECT status
         FROM legal_deadline_warning_deliveries
         WHERE event_id = ? AND tenant_id = ?
         FOR UPDATE`,
        [event.eventId, event.tenantId],
      );
      if (existing[0]?.status === 'DELIVERED') return;

      const deadline = await manager.findOne(LegalDeadline, {
        where: {
          id: Number(event.deadlineId),
          tenant_id: Number(event.tenantId),
        },
        relations: [
          'audience',
          'audience.dossier',
          'audience.dossier.collaborators',
        ],
        lock: { mode: 'pessimistic_write' },
      });
      if (!deadline || deadline.status !== LegalDeadlineStatus.OPEN) return;
      const dossier = deadline.audience?.dossier;
      const intendedRecipients = [
        dossier?.lawyer_id,
        ...(dossier?.collaborators?.map((member) => member.id) ?? []),
      ]
        .map(Number)
        .filter(
          (id, index, all) =>
            Number.isInteger(id) && id > 0 && all.indexOf(id) === index,
        );
      if (!intendedRecipients.length) {
        throw new Error(
          `Délai ${deadline.id}: aucun destinataire d'alerte`,
        );
      }
      const users = await manager.getRepository(User).find({
        where: {
          id: In(intendedRecipients),
          tenant_id: Number(event.tenantId),
        },
        select: ['id'],
      });
      const recipients = users.map((user) => Number(user.id));
      if (recipients.length !== intendedRecipients.length) {
        throw new Error(
          `Délai ${deadline.id}: destinataire absent ou étranger au cabinet`,
        );
      }

      await manager.query(
        `INSERT INTO legal_deadline_warning_deliveries
           (event_id, tenant_id, deadline_id, idempotency_key, status,
            recipient_count, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'PROCESSING', ?, UTC_TIMESTAMP(6), UTC_TIMESTAMP(6))
         ON DUPLICATE KEY UPDATE
           status = 'PROCESSING',
           recipient_count = VALUES(recipient_count),
           updated_at = UTC_TIMESTAMP(6)`,
        [
          event.eventId,
          event.tenantId,
          deadline.id,
          event.idempotencyKey,
          recipients.length,
        ],
      );

      const notificationRepository = manager.getRepository(Notification);
      const notification = await notificationRepository.save(
        notificationRepository.create({
          tenant_id: event.tenantId,
          user_id: null,
          type: NotificationType.DOSSIER_DEADLINE,
          title:
            Number(event.offsetDays) === 0
              ? 'Échéance juridique atteinte'
              : 'Échéance juridique à venir',
          content:
            Number(event.offsetDays) === 0
              ? `Le délai du dossier ${dossier?.dossier_number ?? deadline.dossierId} arrive à échéance aujourd’hui.`
              : `Le délai du dossier ${dossier?.dossier_number ?? deadline.dossierId} arrive à échéance dans ${event.offsetDays} jour(s).`,
          data: {
            deadlineId: deadline.id,
            dossierId: deadline.dossierId,
            audienceId: deadline.audienceId,
            dueAtUtc: deadline.dueAtUtc.toISOString(),
            offsetDays: Number(event.offsetDays),
          },
          link: `/dossiers/${deadline.dossierId}`,
          priority:
            Number(event.offsetDays) <= 1
              ? NotificationPriority.URGENT
              : NotificationPriority.HIGH,
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
      await manager.query(
        `UPDATE legal_deadline_warning_deliveries
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
