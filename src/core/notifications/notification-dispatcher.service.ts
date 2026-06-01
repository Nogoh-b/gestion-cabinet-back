import { MailService } from 'src/core/shared/emails/emails.service';
import { UserRoleAssignment } from 'src/modules/iam/user-role-assignment/entities/user-role-assignment.entity';
import { User } from 'src/modules/iam/user/entities/user.entity';
import { NotificationService } from 'src/modules/notification/notification.service';
import { UserSettings } from 'src/modules/settings/entities/user-settings.entity';
import { Repository } from 'typeorm';
import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import {
  ChannelPreference,
  DispatchAudience,
  NotifiableEvent,
} from './notification-events.enum';

/** Code du rôle administrateur — voir `core/auth/seeders/role.seeder.ts`. */
const ADMIN_ROLE_CODE = 'admin';

/**
 * Payload reçu par `dispatch()`.
 *
 * @param event    Type d'événement notifiable (cf. NotifiableEvent)
 * @param title    Sujet de la notification (in-app + e-mail)
 * @param content  Corps texte court (in-app + fallback e-mail)
 * @param link     URL relative cliquable depuis l'app
 * @param audience Cible : client / avocat / collaborateurs / admins
 * @param entity   Entité métier liée (utile en metadata des mails et data des in-app)
 * @param changes  Diff facultatif (avant/après) pour enrichir le rendu
 * @param emailTemplate  Nom de template Handlebars optionnel — sinon HTML inline
 * @param emailContext   Contexte du template
 */
export interface DispatchPayload {
  event: NotifiableEvent;
  title: string;
  content: string;
  link?: string;
  audience: DispatchAudience;
  entity?: { type: string; id: number | string };
  changes?: Record<string, { from: any; to: any }>;
  emailTemplate?: string;
  emailContext?: Record<string, any>;
}

/**
 * Service central de dispatch des notifications.
 *
 * Appelé depuis les `*.subscriber.ts` qui détectent les événements métier.
 * S'occupe de :
 *  - résoudre les utilisateurs cibles (client, avocat, collabs, admins),
 *  - lire les préférences fines (`user_settings.notification_preferences`),
 *  - envoyer les in-app via `NotificationService.createBulk`,
 *  - envoyer les e-mails via `MailService.sendDirect`.
 *
 * Les erreurs sont logguées mais jamais propagées : une panne mail ne doit
 * pas remonter dans le subscriber et donc pas dans la requête HTTP métier.
 */
@Injectable()
export class NotificationDispatcher {
  private readonly logger = new Logger(NotificationDispatcher.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(UserRoleAssignment)
    private readonly assignmentRepo: Repository<UserRoleAssignment>,
    @InjectRepository(UserSettings)
    private readonly userSettingsRepo: Repository<UserSettings>,
    @Inject(forwardRef(() => NotificationService))
    private readonly notificationService: NotificationService,
    private readonly mailService: MailService,
  ) {
    console.log('NotificationDispatcher initialisé ', forwardRef);
  }

  /**
   * Point d'entrée unique. À appeler depuis n'importe quel subscriber après
   * persistance. Pas de transaction : le métier est déjà commité, on déclenche
   * les effets de bord.
   */
  async dispatch(payload: DispatchPayload): Promise<void> {
    this.logger.log(
      `🚀 dispatch(${payload.event}) début | title="${payload.title}" | entity=${payload.entity?.type}#${payload.entity?.id}`,
    );
    try {
      // 1. Résolution des destinataires employés (avocat + collabs + admins)
      const employeeIds = await this.resolveEmployeeIds(payload.audience);
      this.logger.log(`  ├─ [1/5] resolveEmployeeIds → ${employeeIds.size} employé(s)`);

      // 2. Filtrage par préférences utilisateur
      const channelsByUser = await this.resolveChannels(employeeIds, payload.event);
      const channelsSummary = Array.from(channelsByUser.entries())
        .map(([id, ch]) => `user#${id}: in_app=${ch.in_app} email=${ch.email}`)
        .join(', ');
      this.logger.log(`  ├─ [2/5] resolveChannels → ${channelsByUser.size} utilisateur(s) [${channelsSummary}]`);

      // 3. In-app bulk pour les utilisateurs qui ont in_app=true
      const inAppRecipients = Array.from(channelsByUser.entries())
        .filter(([, ch]) => ch.in_app)
        .map(([id]) => id);

      if (inAppRecipients.length > 0) {
        this.logger.log(`  ├─ [3/5] createBulk in-app → ${inAppRecipients.length} destinataire(s) : [${inAppRecipients.join(', ')}]`);
        await this.notificationService
          .createBulk(
            {
              user_ids: inAppRecipients,
              type: payload.event as any,
              title: payload.title,
              content: payload.content,
              data: {
                entity: payload.entity,
                changes: payload.changes,
              },
              link: payload.link,
              priority: 'NORMAL',
            },
            payload.audience.lawyer_id ?? 1,
          )
          .then(() => this.logger.log(`  │  ✅ createBulk in-app OK`))
          .catch((err) =>
            this.logger.error(`  │  ❌ In-app createBulk a échoué : ${err.message}`, err.stack),
          );
      } else {
        this.logger.log(`  ├─ [3/5] in-app → aucun destinataire (préférences ou pas de cible)`);
      }

      // 4. E-mails employés (préférence email=true) — adresses lookup individuels
      const emailEmployeeIds = Array.from(channelsByUser.entries())
        .filter(([, ch]) => ch.email)
        .map(([id]) => id);

      if (emailEmployeeIds.length > 0) {
        this.logger.log(`  ├─ [4/5] sendEmailsTo employés → ${emailEmployeeIds.length} utilisateur(s) : [${emailEmployeeIds.join(', ')}]`);
        await this.sendEmailsTo(emailEmployeeIds, payload);
      } else {
        this.logger.log(`  ├─ [4/5] emails employés → aucun (préférences ou pas de cible)`);
      }

      // 5. E-mail client (uniquement si la case est cochée)
      const client = payload.audience.client;
      if (client?.notify) {
        this.logger.log(`  ├─ [5/5] sendClientEmail → client user_id=${client.user_id} email=${client.email ?? '?'}`);
        await this.sendClientEmail(client, payload);
      } else {
        this.logger.log(`  ├─ [5/5] email client → non notifié (notify_client=false ou absent)`);
      }

      this.logger.log(`✅ dispatch(${payload.event}) terminé avec succès`);
    } catch (err) {
      // Ceinture/bretelles : le dispatcher ne doit JAMAIS faire échouer un subscriber
      this.logger.error(
        `dispatch(${payload.event}) a échoué silencieusement : ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  // ── Résolution des cibles ─────────────────────────────────────────────────

  private async resolveEmployeeIds(audience: DispatchAudience): Promise<Set<number>> {
    const ids = new Set<number>();
    if (audience.lawyer_id) ids.add(audience.lawyer_id);
    for (const c of audience.collaborator_ids ?? []) if (c) ids.add(c);

    const adminIds = audience.admin_ids_override ?? (await this.resolveAdminIds());
    for (const a of adminIds) ids.add(a);

    return ids;
  }

  /** Récupère les ids de tous les users portant le rôle `admin`. */
  private async resolveAdminIds(): Promise<number[]> {
    const rows = await this.assignmentRepo
      .createQueryBuilder('a')
      .leftJoin('a.role', 'r')
      .where('r.code = :code', { code: ADMIN_ROLE_CODE })
      .select('a.user_id', 'user_id')
      .getRawMany<{ user_id: number }>();
    return rows.map((r) => Number(r.user_id)).filter((id) => !Number.isNaN(id));
  }

  /**
   * Pour chaque user, calcule les canaux activés pour cet événement.
   * Ordre de résolution :
   *   1. notification_preferences[event] s'il existe → autoritaire
   *   2. sinon, fallback sur user_in_app_notifications / user_email_notifications
   *   3. user_notifications_enabled=false → on coupe tout
   */
  private async resolveChannels(
    userIds: Set<number>,
    event: NotifiableEvent,
  ): Promise<Map<number, ChannelPreference>> {
    const map = new Map<number, ChannelPreference>();
    if (userIds.size === 0) return map;

    const settingsList = await this.userSettingsRepo.find({
      where: Array.from(userIds).map((id) => ({ user_id: id })),
    });
    const settingsByUser = new Map(settingsList.map((s) => [s.user_id, s]));

    for (const userId of userIds) {
      const s = settingsByUser.get(userId);

      // Pas de settings du tout → on suppose un nouveau user, defaults raisonnables
      if (!s) {
        map.set(userId, { in_app: true, email: true });
        continue;
      }

      if (s.user_notifications_enabled === false) {
        map.set(userId, { in_app: false, email: false });
        continue;
      }

      const perEvent = s.notification_preferences?.[event];
      if (perEvent) {
        map.set(userId, {
          in_app: !!perEvent.in_app,
          email: !!perEvent.email,
        });
        continue;
      }

      map.set(userId, {
        in_app: !!s.user_in_app_notifications,
        email: !!s.user_email_notifications,
      });
    }

    return map;
  }

  // ── Envoi e-mail ──────────────────────────────────────────────────────────

  private async sendEmailsTo(userIds: number[], payload: DispatchPayload): Promise<void> {
    const users = await this.userRepo.find({
      where: userIds.map((id) => ({ id })),
      select: ['id', 'email', 'first_name', 'last_name'],
    });

    const recipients = users.filter((u) => !!u.email).map((u) => u.email);
    if (recipients.length === 0) return;

    await this.mailService
      .sendDirect({
        to: recipients,
        subject: payload.title,
        templateName: payload.emailTemplate,
        context: payload.emailContext ?? {
          title: payload.title,
          content: payload.content,
          link: payload.link,
          entity: payload.entity,
          changes: payload.changes,
        },
        // Fallback HTML simple si pas de template
        html: payload.emailTemplate
          ? undefined
          : `<h2>${escapeHtml(payload.title)}</h2><p>${escapeHtml(payload.content)}</p>${
              payload.link
                ? `<p><a href="${payload.link}">Ouvrir</a></p>`
                : ''
            }`,
      })
      .catch((err) =>
        this.logger.error(
          `sendEmailsTo([${recipients.join(',')}]) a échoué : ${err.message}`,
          err.stack,
        ),
      );
  }

  private async sendClientEmail(
    client: NonNullable<DispatchAudience['client']>,
    payload: DispatchPayload,
  ): Promise<void> {
    let to = client.email;
    if (!to && client.user_id) {
      const u = await this.userRepo.findOne({
        where: { id: client.user_id },
        select: ['id', 'email'],
      });
      to = u?.email;
    }
    if (!to) {
      this.logger.warn(
        `dispatch(${payload.event}) : notify=true mais aucune adresse e-mail pour le client`,
      );
      return;
    }

    await this.mailService
      .sendDirect({
        to,
        subject: payload.title,
        templateName: payload.emailTemplate,
        context: payload.emailContext ?? {
          title: payload.title,
          content: payload.content,
          link: payload.link,
          entity: payload.entity,
        },
        html: payload.emailTemplate
          ? undefined
          : `<h2>${escapeHtml(payload.title)}</h2><p>${escapeHtml(payload.content)}</p>`,
      })
      .catch((err) =>
        this.logger.error(
          `sendClientEmail(${to}) a échoué : ${err.message}`,
          err.stack,
        ),
      );
  }
}

/** Échappement HTML minimal pour le fallback. */
function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/'/g, '&#39;');
}