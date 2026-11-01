import { TenantContext } from 'src/core/tenant/tenant.context';
import {
  Audience,
  AudienceStatus,
  audienceStatusParam,
} from 'src/modules/audiences/entities/audience.entity';
import { Cabinet } from 'src/modules/cabinet/entities/cabinet.entity';
import {
  Diligence,
  DiligenceStatus,
} from 'src/modules/diligence/entities/diligence.entity';
import { Dossier } from 'src/modules/dossiers/entities/dossier.entity';
import { DossierStatus } from 'src/core/enums/dossier-status.enum';
import { NotificationType } from 'src/modules/notification/enum/notification-type.enum';
import { NotificationService } from 'src/modules/notification/notification.service';
import { Between, DataSource, IsNull, LessThan, Repository, In } from 'typeorm';
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { OutboxService } from '../outbox/outbox.service';

/** Expéditeur système des notifications automatiques. */
const SYSTEM_SENDER_ID = 1;

/** Jours avant échéance déclenchant une alerte (évite le spam quotidien). */
const ALERT_DAYS_BEFORE = new Set([7, 3, 1, 0]);

/**
 * Une diligence échue depuis au plus N jours reçoit son alerte individuelle
 * (rattrape un matin manqué) ; au-delà elle figure dans le résumé quotidien.
 */
const OVERDUE_ALERT_GRACE_DAYS = 3;

/** Dossiers sans suivi : leurs diligences ne déclenchent plus d'alerte. */
const INACTIVE_DOSSIER_STATUSES = new Set<string>([
  DossierStatus.CLOSED,
  DossierStatus.ARCHIVED,
]);

/** Durée de conservation du journal des alertes envoyées. */
const DISPATCH_RETENTION_DAYS = 90;

/** Rappel « l'audience commence bientôt » : dans 30 min au plus. */
export const AUDIENCE_SOON_MINUTES = 30;
/** Alerte « audience non démarrée » : 10 min après l'heure prévue… */
export const AUDIENCE_LATE_MINUTES = 10;
/** …et au plus 2 h après (pas d'alerte pour une audience oubliée depuis longtemps). */
export const AUDIENCE_LATE_MAX_MINUTES = 120;

/**
 * Alerte due pour une audience programmée, `minutesUntil` minutes avant son
 * heure prévue (négatif : heure passée) : 'soon', 'late' ou null.
 */
export function imminentAudienceAlert(minutesUntil: number): 'soon' | 'late' | null {
  if (minutesUntil > 0 && minutesUntil <= AUDIENCE_SOON_MINUTES) return 'soon';
  if (-minutesUntil >= AUDIENCE_LATE_MINUTES && -minutesUntil <= AUDIENCE_LATE_MAX_MINUTES) return 'late';
  return null;
}

/**
 * ReminderScheduler — pousse les alertes proactives (rappels d'audience,
 * diligences à échoir/en retard, délais de recours).
 *
 * ⚠️ Multi-tenant : un cron tourne SANS contexte tenant (AsyncLocalStorage
 * vide). Le patch Repository ne filtre alors plus par tenant ET les
 * notifications créées seraient estampillées tenant_id=1 (invisibles aux
 * autres cabinets). On itère donc cabinet par cabinet dans
 * `tenantContext.run(cabinetId, …)` : les lectures sont scopées au cabinet et
 * les notifications sont estampillées au bon tenant.
 */
@Injectable()
export class ReminderScheduler {
  private readonly logger = new Logger(ReminderScheduler.name);

  constructor(
    @InjectRepository(Cabinet)
    private readonly cabinetRepo: Repository<Cabinet>,
    @InjectRepository(Audience)
    private readonly audienceRepo: Repository<Audience>,
    @InjectRepository(Diligence)
    private readonly diligenceRepo: Repository<Diligence>,
    private readonly notifications: NotificationService,
    private readonly tenantContext: TenantContext,
    private readonly dataSource: DataSource,
    private readonly outboxService: OutboxService,
    @InjectDataSource()
    private readonly db: DataSource,
  ) {}

  // ── Crons ────────────────────────────────────────────────────────────────

  /** Rappels d'audience — toutes les heures (fenêtre de 48 h, une seule fois). */
  @Cron(CronExpression.EVERY_HOUR)
  async runAudienceReminders(): Promise<void> {
    await this.forEachActiveCabinet((cabinetId) =>
      this.remindAudiences(cabinetId),
    );
  }

  /**
   * Audiences imminentes — toutes les 5 min : une notification 30 min avant,
   * une autre si l'audience n'est pas démarrée 10 min après l'heure prévue.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async runImminentAudienceAlerts(): Promise<void> {
    await this.forEachActiveCabinet((cabinetId) =>
      this.alertImminentAudiences(cabinetId),
    );
  }

  /** Échéances (diligences + délais de recours) — chaque jour à 7 h. */
  @Cron(CronExpression.EVERY_DAY_AT_7AM)
  async runDeadlineAlerts(): Promise<void> {
    await this.forEachActiveCabinet(async (cabinetId) => {
      await this.remindDiligenceDeadlines(cabinetId);
    });
    await this.pruneDispatches();
  }

  // ── Itération tenant-aware ───────────────────────────────────────────────

  private async forEachActiveCabinet(
    fn: (cabinetId: number) => Promise<void>,
  ): Promise<void> {
    // Cabinet est une entité plateforme (sans tenant_id) → pas de filtre ici.
    const cabinets = await this.cabinetRepo.find({
      where: { status: In(['active', 'trial']) },
      select: ['id'],
    });
    for (const c of cabinets) {
      try {
        await this.tenantContext.run(c.id, () => fn(c.id));
      } catch (e: any) {
        this.logger.error(
          `[Reminder] cabinet=${c.id} échec: ${e?.message ?? e}`,
        );
      }
    }
  }

  // ── Rappels d'audience ───────────────────────────────────────────────────

  private async remindAudiences(cabinetId: number): Promise<void> {
    const candidates = await this.audienceRepo.find({
      // Colonne ENUM ('0'..'4') : un nombre serait lu comme un index d'enum.
      where: { reminder_sent: false, status: audienceStatusParam(AudienceStatus.SCHEDULED) },
      relations: ['dossier', 'dossier.collaborators'],
    });
    // Fenêtre de rappel : audience à venir dans ≤ 48 h. On calcule ici plutôt
    // que via le getter `needs_reminder` (fragile selon le type de audience_date).
    const now = Date.now();
    const due = candidates.filter((a) => {
      const when = this.audienceDateTime(a);
      if (!when) return false;
      const diffHours = (when.getTime() - now) / 3_600_000;
      return diffHours > 0 && diffHours <= 48;
    });

    for (const a of due) {
      const recipients = this.uniqueIds([
        a.dossier?.lawyer_id,
        ...(a.dossier?.collaborators?.map((c) => c.id) ?? []),
      ]);
      if (!recipients.length) {
        this.logger.warn(
          `[Reminder] cabinet=${cabinetId} audience=${a.id} sans destinataire; rappel non acquitté`,
        );
        continue;
      }

      await this.dataSource.transaction(async (manager) => {
        await this.outboxService.enqueue(manager, {
          eventType: 'audience.reminder.requested',
          aggregateType: 'Audience',
          aggregateId: a.id,
          idempotencyKey:
            `audience-reminder:${a.id}:` +
            `${a.starts_at_utc?.toISOString?.() ?? this.audienceDateTime(a)?.toISOString()}`,
          payload: {
            audienceId: a.id,
            dossierId: Number(a.dossier_id),
          },
        });
      });
    }

    if (due.length) {
      this.logger.log(
        `[Reminder] cabinet=${cabinetId} — ${due.length} rappel(s) d'audience`,
      );
    }
  }

  /**
   * Audiences programmées d'hier à demain : « commence dans X min » (≤ 30 min)
   * et « non démarrée » (10 min à 2 h après l'heure prévue). Une seule fois
   * chacune ; la clé contient la date et l'heure, donc une audience déplacée
   * est rappelée de nouveau. Destinataires : avocat et collaborateurs du dossier.
   */
  private async alertImminentAudiences(cabinetId: number): Promise<void> {
    const candidates = await this.audienceRepo.find({
      where: {
        status: audienceStatusParam(AudienceStatus.SCHEDULED),
        audience_date: Between(this.dayKey(this.shiftDays(-1)), this.dayKey(this.shiftDays(1))) as any,
      },
      relations: ['dossier', 'dossier.collaborators'],
    });

    const now = Date.now();
    let sent = 0;
    for (const a of candidates) {
      const when = this.audienceDateTime(a);
      if (!when) continue;
      const minutesUntil = Math.round((when.getTime() - now) / 60_000);
      const alert = imminentAudienceAlert(minutesUntil);
      if (!alert) continue;
      const recipients = this.uniqueIds([
        a.dossier?.lawyer_id,
        ...(a.dossier?.collaborators?.map((c) => c.id) ?? []),
      ]);
      if (!recipients.length) continue;
      const slot = `${this.dayKey(a.audience_date)}T${a.audience_time ?? ''}`;
      if (!(await this.claim(cabinetId, `audience_${alert}`, `${a.id}:${slot}`, this.dayKey(when))))
        continue;

      const dossier = a.dossier?.dossier_number ?? a.dossier_id;
      const room = a.room ? ` (salle ${a.room})` : '';
      await this.notifications.createBulk(
        {
          user_ids: recipients,
          type: NotificationType.AUDIENCE_REMINDER,
          title: alert === 'soon' ? `Audience dans ${minutesUntil} min` : 'Audience non démarrée',
          content:
            alert === 'soon'
              ? `L'audience du dossier ${dossier} commence à ${a.audience_time}${room}.`
              : `L'audience du dossier ${dossier} prévue à ${a.audience_time}${room} n'a pas été démarrée.`,
          data: { audienceId: a.id, dossierId: a.dossier_id, alert, minutesUntil },
          link: `/audiences/${a.id}`,
          priority: alert === 'soon' ? 'HIGH' : 'URGENT',
        },
        SYSTEM_SENDER_ID,
      );
      sent++;
    }
    if (sent)
      this.logger.log(`[Reminder] cabinet=${cabinetId} — ${sent} alerte(s) d'audience imminente`);
  }

  // ── Diligences à échoir / en retard ──────────────────────────────────────

  /**
   * À échoir : une alerte à J-7/J-3/J-1/J-0. Passage en retard : une alerte
   * individuelle, une seule fois. Les autres retards : un seul résumé par
   * avocat et par jour. Chaque envoi est réservé en base avant d'être fait.
   */
  private async remindDiligenceDeadlines(cabinetId: number): Promise<void> {
    const { startToday, inDays } = this.dateWindow(7);
    const today = this.dayKey(startToday);
    const diligences = (
      await this.diligenceRepo.find({
        where: { completion_date: IsNull(), deadline: LessThan(inDays) },
        relations: ['dossier'],
      })
    ).filter((d) => this.isFollowed(d));

    let sent = 0;
    // Retards anciens à résumer, par destinataire.
    const backlog = new Map<number, Diligence[]>();
    for (const d of diligences) {
      const recipient = d.assigned_lawyer_id ?? d.dossier?.lawyer_id;
      if (!recipient) continue;
      const left = this.daysUntil(d.deadline, startToday);
      const deadline = this.dayKey(d.deadline);

      if (left >= 0) {
        if (!ALERT_DAYS_BEFORE.has(left)) continue;
        if (
          !(await this.claim(
            cabinetId,
            'diligence_due',
            `${d.id}:${deadline}:${left}`,
            today,
          ))
        )
          continue;
        await this.notifyDiligence(d, recipient, left);
        sent++;
        continue;
      }

      // Retard récent : alerte de passage en retard, une fois par échéance
      // (clé datée de l'échéance, pas du jour). Pas de résumé pour elle tant
      // qu'elle est dans ce délai : l'alerte individuelle suffit.
      if (-left <= OVERDUE_ALERT_GRACE_DAYS) {
        if (
          await this.claim(
            cabinetId,
            'diligence_overdue',
            String(d.id),
            deadline,
          )
        ) {
          await this.notifyDiligence(d, recipient, left);
          sent++;
        }
        continue;
      }
      backlog.set(recipient, [...(backlog.get(recipient) ?? []), d]);
    }

    for (const [recipient, overdue] of backlog) {
      if (
        !(await this.claim(
          cabinetId,
          'diligence_overdue_digest',
          String(recipient),
          today,
        ))
      )
        continue;
      const oldest = overdue.reduce((a, b) =>
        new Date(a.deadline) <= new Date(b.deadline) ? a : b,
      );
      await this.notifications.createBulk(
        {
          user_ids: [recipient],
          type: NotificationType.DILIGENCE_DEADLINE,
          title:
            overdue.length > 1
              ? `${overdue.length} diligences en retard`
              : 'Diligence en retard',
          content:
            overdue.length > 1
              ? `Vous avez ${overdue.length} diligences en retard. La plus ancienne : « ${oldest.title ?? oldest.id} » (échéance ${this.fmtDate(oldest.deadline)}).`
              : `La diligence « ${oldest.title ?? oldest.id} » est toujours en retard (échéance ${this.fmtDate(oldest.deadline)}).`,
          data: {
            overdue: true,
            digest: true,
            count: overdue.length,
            diligenceIds: overdue.slice(0, 50).map((d) => d.id),
          },
          link:
            overdue.length > 1
              ? '/dossiers/diligences'
              : `/dossiers/${oldest.dossier_id}`,
          priority: 'HIGH',
        },
        SYSTEM_SENDER_ID,
      );
      sent++;
    }

    if (sent)
      this.logger.log(
        `[Reminder] cabinet=${cabinetId} — ${sent} alerte(s) diligence`,
      );
  }

  private async notifyDiligence(
    d: Diligence,
    recipient: number,
    left: number,
  ): Promise<void> {
    const overdue = left < 0;
    await this.notifications.createBulk(
      {
        user_ids: [recipient],
        type: NotificationType.DILIGENCE_DEADLINE,
        title: overdue ? 'Diligence en retard' : 'Échéance de diligence',
        content: overdue
          ? `La diligence « ${d.title ?? d.id} » est en retard (échéance ${this.fmtDate(d.deadline)}).`
          : `La diligence « ${d.title ?? d.id} » arrive à échéance ${this.relDay(left)} (${this.fmtDate(d.deadline)}).`,
        data: {
          diligenceId: d.id,
          dossierId: d.dossier_id,
          overdue,
          daysLeft: left,
        },
        link: `/dossiers/${d.dossier_id}`,
        priority: overdue ? 'URGENT' : 'HIGH',
      },
      SYSTEM_SENDER_ID,
    );
  }

  /** Diligence encore suivie : ni terminée/annulée, dossier présent et actif. */
  private isFollowed(d: Diligence): boolean {
    if (
      d.status === DiligenceStatus.COMPLETED ||
      d.status === DiligenceStatus.CANCELLED
    )
      return false;
    // Dossier supprimé (soft delete) → relation non chargée.
    if (!d.dossier) return false;
    // Colonne ENUM MySQL : la valeur revient en chaîne ('8') → Number().
    return !INACTIVE_DOSSIER_STATUSES.has(String(d.dossier.status));
  }

  // ── Délais de recours (appel / cassation) ────────────────────────────────

  // ── Helpers ──────────────────────────────────────────────────────────────

  /** 'YYYY-MM-DD' en heure locale (colonnes DATE). */
  private dayKey(date: Date | string): string {
    if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(date))
      return date.slice(0, 10);
    const d = new Date(date);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  private uniqueIds(ids: Array<number | null | undefined>): number[] {
    return [...new Set(ids.filter((x): x is number => !!x))];
  }

  /** Combine audience_date (Date ou 'YYYY-MM-DD') + audience_time ('HH:mm'). */
  private audienceDateTime(a: Audience): Date | null {
    if (a.starts_at_utc) {
      const canonical = new Date(a.starts_at_utc);
      return Number.isNaN(canonical.getTime()) ? null : canonical;
    }
    if (!a.audience_date) return null;
    const datePart =
      a.audience_date instanceof Date
        ? a.audience_date.toISOString().slice(0, 10)
        : String(a.audience_date).slice(0, 10);
    const timePart = a.audience_time?.trim() || '00:00';
    const dt = new Date(`${datePart}T${timePart}`);
    return isNaN(dt.getTime()) ? null : dt;
  }

  /** Aujourd'hui décalé de `days` jours. */
  private shiftDays(days: number): Date {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date;
  }

  private dateWindow(days: number): { startToday: Date; inDays: Date } {
    const now = new Date();
    const startToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const inDays = new Date(startToday);
    inDays.setDate(inDays.getDate() + days);
    return { startToday, inDays };
  }

  /** Nombre de jours pleins entre aujourd'hui et `date` (négatif = passé). */
  private daysUntil(date: Date | string, startToday: Date): number {
    const d = new Date(date);
    const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    return Math.round((target.getTime() - startToday.getTime()) / 86_400_000);
  }

  private relDay(daysLeft: number): string {
    if (daysLeft <= 0) return "aujourd'hui";
    if (daysLeft === 1) return 'demain';
    return `dans ${daysLeft} jours`;
  }

  private fmtDate(date: Date | string): string {
    try {
      return new Date(date).toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      });
    } catch {
      return String(date);
    }
  }

  // ── Journal des envois ───────────────────────────────────────────────────

  /**
   * Réserve un envoi : true si la ligne vient d'être créée, false si cet envoi
   * a déjà eu lieu (autre passage, autre instance). Réserver avant de notifier
   * préfère une alerte perdue (échec d'envoi) à une alerte répétée.
   */
  private async claim(
    tenantId: number,
    kind: string,
    refKey: string,
    day: string,
  ): Promise<boolean> {
    const result = await this.db.query(
      'INSERT IGNORE INTO `reminder_dispatches` (`tenant_id`, `kind`, `ref_key`, `sent_on`) VALUES (?, ?, ?, ?)',
      [tenantId, kind, refKey.slice(0, 160), day],
    );
    return Number(result?.affectedRows ?? 0) === 1;
  }

  private async pruneDispatches(): Promise<void> {
    try {
      await this.db.query(
        'DELETE FROM `reminder_dispatches` WHERE `created_at` < DATE_SUB(NOW(), INTERVAL ? DAY)',
        [DISPATCH_RETENTION_DAYS],
      );
    } catch (e: any) {
      this.logger.warn(`[Reminder] purge du journal impossible : ${e?.message ?? e}`);
    }
  }
}
