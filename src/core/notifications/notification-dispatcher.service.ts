import { MailService } from 'src/core/shared/emails/emails.service';
import { UserRoleAssignment } from 'src/modules/iam/user-role-assignment/entities/user-role-assignment.entity';
import { User } from 'src/modules/iam/user/entities/user.entity';
import { MailTemplateService } from 'src/modules/mail-template/mail-template.service';
import { NotificationService } from 'src/modules/notification/notification.service';
import { UserSettings } from 'src/modules/settings/entities/user-settings.entity';
import { Repository } from 'typeorm';
import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { addTenantCondition } from '../tenant/tenant-repository.patch';

import {
  ChannelPreference,
  DispatchAudience,
  NotifiableEvent,
} from './notification-events.enum';

/** Code du rôle administrateur — voir `core/auth/seeders/role.seeder.ts`. */
const ADMIN_ROLE_CODE = 'admin';
type NotificationMailAudience = 'client' | 'employee';

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
 *  - envoyer les e-mails via `MailService.sendDirect` (en utilisant les
 *    templates mail de la table `mail_templates`).
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
    private readonly mailTemplateService: MailTemplateService,
  ) {}

  /**
   * Point d'entrée unique. À appeler depuis n'importe quel subscriber après
   * persistance. Pas de transaction : le métier est déjà commité, on déclenche
   * les effets de bord.
   */
  async dispatch(payload: DispatchPayload): Promise<void> {
    this.logger.log(
      `🚀 dispatch(${payload.event}) début | title="${payload.title}" | entity=${payload.entity?.type}#${payload.entity?.id}`,
    );
    this.logger.log(
      `  │  action=${payload.event} | lien=${payload.link ?? '-'} | audience=${this.describeAudience(payload.audience)}`,
    );
    try {
      // 1. Résolution des destinataires employés (avocat + collabs + admins)
      const employeeIds = await this.resolveEmployeeIds(payload.audience);
      this.logger.log(`  ├─ [1/5] resolveEmployeeIds → ${employeeIds.size} employé(s)`);
      const clientChannels = await this.resolveClientChannels(
        payload.audience.client,
        payload.event,
      );
      if (payload.audience.client?.notify && payload.audience.client.user_id) {
        this.logger.log(
          `  │  client user#${payload.audience.client.user_id}: in_app=${clientChannels?.in_app ?? false} email=${clientChannels?.email ?? true}`,
        );
      }

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
      if (
        payload.audience.client?.notify &&
        payload.audience.client.user_id &&
        clientChannels?.in_app
      ) {
        inAppRecipients.push(payload.audience.client.user_id);
      }
      const dedupedInAppRecipients = Array.from(new Set(inAppRecipients));

      if (dedupedInAppRecipients.length > 0) {
        this.logger.log(`  ├─ [3/5] createBulk in-app → ${dedupedInAppRecipients.length} destinataire(s) : [${dedupedInAppRecipients.join(', ')}]`);
        await this.notificationService
          .createBulk(
            {
              user_ids: dedupedInAppRecipients,
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
        if (clientChannels && !clientChannels.email) {
          this.logger.log(`  ├─ [5/5] email client → désactivé par préférences utilisateur`);
        } else {
          this.logger.log(`  ├─ [5/5] sendClientEmail → client user_id=${client.user_id} email=${client.email ?? '?'}`);
          await this.sendClientEmail(client, payload);
        }
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

  // ── Résolution des templates mail ──────────────────────────────────────────

  /**
   * Mapping entre chaque `NotifiableEvent` et le `code` du template mail
   * correspondant dans la table `mail_templates`.
   */
  private resolveTemplateCode(event: NotifiableEvent): string | null {
    const map: Record<string, string> = {
      [NotifiableEvent.DOSSIER_CREATED]: 'dossier_created',
      [NotifiableEvent.DOSSIER_UPDATED]: 'dossier_updated',
      [NotifiableEvent.DOSSIER_STATUS_CHANGED]: 'dossier_status_changed',
      [NotifiableEvent.DOSSIER_CLOSED]: 'dossier_closed',
      [NotifiableEvent.COLLABORATOR_ADDED]: 'collaborator_added',
      [NotifiableEvent.COLLABORATOR_REMOVED]: 'collaborator_removed',
      [NotifiableEvent.AUDIENCE_CREATED]: 'audience_created',
      [NotifiableEvent.AUDIENCE_HELD]: 'audience_held',
      [NotifiableEvent.AUDIENCE_UPDATED]: 'audience_updated',
      [NotifiableEvent.AUDIENCE_REMINDER]: 'audience_reminder',
      [NotifiableEvent.FACTURE_CREATED]: 'facture_created',
      [NotifiableEvent.FACTURE_PAID]: 'facture_paid',
      [NotifiableEvent.FACTURE_OVERDUE]: 'facture_overdue',
      [NotifiableEvent.PAIEMENT_RECEIVED]: 'paiement_received',
      [NotifiableEvent.DOCUMENT_UPLOADED]: 'document_uploaded',
      [NotifiableEvent.DOCUMENT_SHARED]: 'document_shared',
      [NotifiableEvent.DILIGENCE_ASSIGNED]: 'diligence_assigned',
      [NotifiableEvent.DILIGENCE_COMPLETED]: 'diligence_completed',
      [NotifiableEvent.PROCEDURE_STAGE_CHANGED]: 'procedure_stage_changed',
    };
    return map[event] ?? null;
  }

  /**
   * Essaie de rendre un e-mail via un template DB (table `mail_templates`).
   * Si aucun template n'est trouvé en base, retourne un fallback HTML simple.
   */
  private async renderEmail(
    payload: DispatchPayload,
    audience: NotificationMailAudience,
  ): Promise<{ subject: string; html: string }> {
    const templateCode = this.resolveTemplateCode(payload.event);
    const context = {
      title: payload.title,
      content: payload.content,
      link: payload.link ?? '',
      entity: payload.entity,
      changes: payload.changes,
      recipient_type: audience,
      ...payload.emailContext,
    };

    if (templateCode) {
      const templateCodes = [`${templateCode}_${audience}`, templateCode];

      for (const code of templateCodes) {
        try {
          const rendered = await this.mailTemplateService.renderOrCreateSystemDefault(
            code,
            context,
          );
          this.logger.log(`  |  Template "${code}" rendu avec succes`);
          return rendered;
        } catch (err) {
          if ((err as Error).message.includes('introuvable')) continue;
          this.logger.warn(`  |  Template "${code}" erreur rendu : ${(err as Error).message}.`);
        }
      }
    }

    // Fallback HTML simple si pas de template
    return {
      subject: payload.title,
      html:
        `<h2>${escapeHtml(payload.title)}</h2><p>${escapeHtml(payload.content)}</p>` +
        (payload.link ? `<p><a href="${payload.link}">Ouvrir</a></p>` : ''),
    };
  }

  // ── Résolution des cibles ─────────────────────────────────────────────────

  private async resolveEmployeeIds(audience: DispatchAudience): Promise<Set<number>> {
    const ids = new Set<number>();
    if (audience.lawyer_id) ids.add(audience.lawyer_id);
    for (const c of audience.collaborator_ids ?? []) if (c) ids.add(c);

    const adminIds = audience.admin_ids_override ?? (await this.resolveAdminIds());
    for (const a of adminIds) ids.add(a);

    this.logger.log(
      `  │  employés ciblés | lawyer=${audience.lawyer_id ?? '-'} | collabs=[${(audience.collaborator_ids ?? []).join(', ')}] | admins=[${adminIds.join(', ')}] | final=[${Array.from(ids).join(', ')}]`,
    );

    return ids;
  }

  /** Récupère les ids de tous les users portant le rôle `admin`. */
  private async resolveAdminIds(): Promise<number[]> {
    let qb = this.assignmentRepo
      .createQueryBuilder('a')
      .leftJoin('a.role', 'r')
      .where('r.code = :code', { code: ADMIN_ROLE_CODE })
      .select('a.user_id', 'user_id');

    qb = addTenantCondition(qb, 'a');

    const rows = await qb.getRawMany<{ user_id: number }>();
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

  private async resolveClientChannels(
    client: DispatchAudience['client'],
    event: NotifiableEvent,
  ): Promise<ChannelPreference | null> {
    if (!client?.user_id) return null;

    const map = await this.resolveChannels(new Set([client.user_id]), event);
    return map.get(client.user_id) ?? { in_app: true, email: true };
  }

  private async sendEmailsTo(userIds: number[], payload: DispatchPayload): Promise<void> {
    const users = await this.userRepo.find({
      where: userIds.map((id) => ({ id })),
      select: ['id', 'email', 'first_name', 'last_name'],
    });

    const recipients = users.filter((u) => !!u.email).map((u) => u.email);
    this.logger.log(
      `  │  emails employés résolus → users=[${users.map((u) => `${u.id}:${u.email ?? 'sans-email'}`).join(', ')}]`,
    );
    if (recipients.length === 0) {
      this.logger.warn(`  │  aucun e-mail employé exploitable pour ${payload.event}`);
      return;
    }

    // Rendu du template mail (DB ou fallback HTML)
    const { subject, html } = await this.renderEmail(payload, 'employee');
    this.logger.log(
      `  │  envoi mail employés → subject="${subject}" | recipients=[${recipients.join(', ')}]`,
    );

    await this.mailService
      .sendDirect({
        to: recipients,
        subject,
        html,
      })
      .then(() =>
        this.logger.log(
          `  │  ✅ mails employés envoyés | count=${recipients.length}`,
        ),
      )
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
    this.logger.log(
      `  │  client notifiable → user_id=${client.user_id ?? '-'} | email=${to} | notify=${client.notify}`,
    );

    // Rendu du template mail (DB ou fallback HTML)
    const { subject, html } = await this.renderEmail(payload, 'client');
    this.logger.log(`  │  envoi mail client → subject="${subject}" | to=${to}`);

    await this.mailService
      .sendDirect({
        to,
        subject,
        html,
      })
      .then(() =>
        this.logger.log(`  │  ✅ mail client envoyé → ${to}`),
      )
      .catch((err) =>
        this.logger.error(
          `sendClientEmail(${to}) a échoué : ${err.message}`,
          err.stack,
        ),
      );
  }

  private describeAudience(audience: DispatchAudience): string {
    const client = audience.client
      ? `client(user=${audience.client.user_id ?? '-'}, email=${audience.client.email ?? '-'}, notify=${audience.client.notify})`
      : 'client(-)';
    const lawyer = `lawyer=${audience.lawyer_id ?? '-'}`;
    const collabs = `collabs=[${(audience.collaborator_ids ?? []).join(', ')}]`;
    const admins = audience.admin_ids_override
      ? `admins_override=[${audience.admin_ids_override.join(', ')}]`
      : 'admins=auto';

    return `${client} | ${lawyer} | ${collabs} | ${admins}`;
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

