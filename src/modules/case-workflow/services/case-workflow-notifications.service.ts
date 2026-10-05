// src/modules/case-workflow/services/case-workflow-notifications.service.ts
import { Injectable, Logger } from '@nestjs/common';

import { NotificationType } from 'src/modules/notification/enum/notification-type.enum';
import { NotificationService } from 'src/modules/notification/notification.service';
import { DossierAction } from '../entities/dossier-action.entity';

/**
 * Notifications du parcours dossier (actions).
 *
 * Périmètre volontairement limité aux traitements qui n'étaient diffusés par
 * AUCUN canal : démarrage, mise en attente, annulation, report d'échéance.
 *
 *  - l'assignation est déjà notifiée par la diligence liée
 *    (`DILIGENCE_ASSIGNED`, cf. `DiligenceSubscriber`) ;
 *  - la complétion est déjà notifiée par cette même diligence
 *    (`DILIGENCE_COMPLETED`).
 *
 * On ne duplique donc pas ces deux événements ici (Option A) : émettre en plus
 * une notification « action » produirait 2 à 4 notifications par action.
 *
 * Règle de diffusion : seul le responsable de l'action est prévenu, et jamais
 * l'auteur du geste (on ne notifie personne de sa propre action) — même
 * sémantique que `HrNotificationsService`. Aucun administrateur n'est ajouté
 * d'office, contrairement au `NotificationDispatcher`.
 *
 * Aucune méthode ne propage d'erreur : un incident de notification ne doit
 * jamais faire échouer un démarrage, une annulation ou un report d'échéance.
 */

/** `user_id` porté par la notification comme émetteur (convention scheduler/RH). */
const SYSTEM_SENDER_ID = 1;

function formatDate(value: Date | string | null | undefined): string {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

interface Payload {
  type: NotificationType;
  title: string;
  content: string;
  data: Record<string, unknown>;
  link: string;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
}

@Injectable()
export class CaseWorkflowNotificationsService {
  private readonly logger = new Logger(CaseWorkflowNotificationsService.name);

  constructor(private readonly notifications: NotificationService) {}

  // ── Résolution des destinataires ───────────────────────────────────────────

  /**
   * Responsable de l'action, sauf s'il est l'auteur du geste. Aucun autre
   * destinataire : les admins ne sont pas ajoutés d'office (Option A).
   */
  private recipients(
    action: DossierAction | null | undefined,
    actorId?: number,
  ): number[] {
    const responsible = action?.responsible_user_id;
    if (!responsible || responsible === actorId) return [];
    return [responsible];
  }

  /** Lien profond vers l'action dans l'espace dossier (même ancre que la diligence). */
  private link(action: DossierAction): string {
    return `/dossiers/${action.dossier_id}?tab=steps#action-${action.id}`;
  }

  // ── Diffusion ──────────────────────────────────────────────────────────────

  /** Envoie la notification ; journalise et absorbe toute erreur. */
  private async send(userIds: number[], payload: Payload): Promise<void> {
    const recipients = [...new Set(userIds.filter(Boolean))];
    if (recipients.length === 0) return;

    try {
      await this.notifications.createBulk(
        {
          user_ids: recipients,
          type: payload.type,
          title: payload.title,
          content: payload.content,
          data: payload.data,
          link: payload.link,
          priority: payload.priority,
        },
        SYSTEM_SENDER_ID,
      );
    } catch (error) {
      this.logger.warn(
        `Notification ${payload.type} non distribuée à [${recipients.join(', ')}] : ${
          (error as Error).message
        }`,
      );
    }
  }

  // ── Traitements de l'action ────────────────────────────────────────────────

  /** L'action passe à « en cours » : le responsable est prévenu. */
  async actionStarted(
    action: DossierAction,
    actorId?: number,
  ): Promise<void> {
    await this.send(this.recipients(action, actorId), {
      type: NotificationType.DOSSIER_ACTION_STARTED,
      title: 'Action démarrée',
      content: `L'action « ${action.title} » a été démarrée.`,
      data: {
        actionId: action.id,
        dossierId: action.dossier_id,
        status: action.status,
      },
      link: this.link(action),
      priority: 'NORMAL',
    });
  }

  /** L'action passe « en attente » : le responsable est prévenu. */
  async actionHeld(
    action: DossierAction,
    actorId?: number,
    reason?: string | null,
  ): Promise<void> {
    const motif = reason ? ` Motif : ${reason}` : '';

    await this.send(this.recipients(action, actorId), {
      type: NotificationType.DOSSIER_ACTION_ON_HOLD,
      title: 'Action mise en attente',
      content: `L'action « ${action.title} » a été mise en attente.${motif}`,
      data: {
        actionId: action.id,
        dossierId: action.dossier_id,
        status: action.status,
        reason: reason ?? null,
      },
      link: this.link(action),
      priority: 'NORMAL',
    });
  }

  /** L'action est annulée : le responsable est prévenu. */
  async actionCancelled(
    action: DossierAction,
    actorId?: number,
    reason?: string | null,
  ): Promise<void> {
    const motif = reason ? ` Motif : ${reason}` : '';

    await this.send(this.recipients(action, actorId), {
      type: NotificationType.DOSSIER_ACTION_CANCELLED,
      title: 'Action annulée',
      content: `L'action « ${action.title} » a été annulée.${motif}`,
      data: {
        actionId: action.id,
        dossierId: action.dossier_id,
        status: action.status,
        reason: reason ?? null,
      },
      link: this.link(action),
      priority: 'HIGH',
    });
  }

  /** L'échéance de l'action est reportée : le responsable est prévenu. */
  async actionDeadlineExtended(
    action: DossierAction,
    actorId?: number,
    previousDueAt?: Date | null,
  ): Promise<void> {
    const from = previousDueAt
      ? ` du ${formatDate(previousDueAt)} au ${formatDate(action.due_at)}`
      : ` au ${formatDate(action.due_at)}`;

    await this.send(this.recipients(action, actorId), {
      type: NotificationType.DOSSIER_ACTION_DEADLINE_EXTENDED,
      title: 'Échéance reportée',
      content: `L'échéance de l'action « ${action.title} » a été reportée${from}.`,
      data: {
        actionId: action.id,
        dossierId: action.dossier_id,
        previousDueAt: previousDueAt?.toISOString() ?? null,
        dueAt: action.due_at?.toISOString() ?? null,
      },
      link: this.link(action),
      priority: 'NORMAL',
    });
  }
}
