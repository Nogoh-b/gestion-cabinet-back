import { TenantContext } from 'src/core/tenant/tenant.context';
import { Audience, AudienceStatus } from 'src/modules/audiences/entities/audience.entity';
import { Cabinet } from 'src/modules/cabinet/entities/cabinet.entity';
import { Diligence } from 'src/modules/diligence/entities/diligence.entity';
import { NotificationType } from 'src/modules/notification/enum/notification-type.enum';
import { NotificationService } from 'src/modules/notification/notification.service';
import { DataSource, IsNull, LessThan, Repository, In } from 'typeorm';
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { OutboxService } from '../outbox/outbox.service';

/** Expéditeur système des notifications automatiques. */
const SYSTEM_SENDER_ID = 1;

/** Jours avant échéance déclenchant une alerte (évite le spam quotidien). */
const ALERT_DAYS_BEFORE = new Set([7, 3, 1, 0]);

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
    @InjectRepository(Cabinet) private readonly cabinetRepo: Repository<Cabinet>,
    @InjectRepository(Audience) private readonly audienceRepo: Repository<Audience>,
    @InjectRepository(Diligence) private readonly diligenceRepo: Repository<Diligence>,
    private readonly notifications: NotificationService,
    private readonly tenantContext: TenantContext,
    private readonly dataSource: DataSource,
    private readonly outboxService: OutboxService,
  ) {}

  // ── Crons ────────────────────────────────────────────────────────────────

  /** Rappels d'audience — toutes les heures (fenêtre de 48 h, une seule fois). */
  @Cron(CronExpression.EVERY_HOUR)
  async runAudienceReminders(): Promise<void> {
    await this.forEachActiveCabinet((cabinetId) => this.remindAudiences(cabinetId));
  }

  /** Échéances (diligences + délais de recours) — chaque jour à 7 h. */
  @Cron(CronExpression.EVERY_DAY_AT_7AM)
  async runDeadlineAlerts(): Promise<void> {
    await this.forEachActiveCabinet(async (cabinetId) => {
      await this.remindDiligenceDeadlines(cabinetId);
    });
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
        this.logger.error(`[Reminder] cabinet=${c.id} échec: ${e?.message ?? e}`);
      }
    }
  }

  // ── Rappels d'audience ───────────────────────────────────────────────────

  private async remindAudiences(cabinetId: number): Promise<void> {
    const candidates = await this.audienceRepo.find({
      where: { reminder_sent: false, status: AudienceStatus.SCHEDULED },
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
      this.logger.log(`[Reminder] cabinet=${cabinetId} — ${due.length} rappel(s) d'audience`);
    }
  }

  // ── Diligences à échoir / en retard ──────────────────────────────────────

  private async remindDiligenceDeadlines(cabinetId: number): Promise<void> {
    const { startToday, inDays } = this.dateWindow(7);
    const diligences = await this.diligenceRepo.find({
      where: { completion_date: IsNull(), deadline: LessThan(inDays) },
      relations: ['dossier'],
    });

    let sent = 0;
    for (const d of diligences) {
      const left = this.daysUntil(d.deadline, startToday);
      const overdue = left < 0;
      // Échus : alerte quotidienne. À venir : seulement à J-7/J-3/J-1/J-0.
      if (!overdue && !ALERT_DAYS_BEFORE.has(left)) continue;

      const recipient = d.assigned_lawyer_id ?? d.dossier?.lawyer_id;
      if (!recipient) continue;

      await this.notifications.createBulk(
        {
          user_ids: [recipient],
          type: NotificationType.DILIGENCE_DEADLINE,
          title: overdue ? 'Diligence en retard' : 'Échéance de diligence',
          content: overdue
            ? `La diligence « ${d.title ?? d.id} » est en retard (échéance ${this.fmtDate(d.deadline)}).`
            : `La diligence « ${d.title ?? d.id} » arrive à échéance ${this.relDay(left)} (${this.fmtDate(d.deadline)}).`,
          data: { diligenceId: d.id, dossierId: d.dossier_id, overdue, daysLeft: left },
          link: `/dossiers/${d.dossier_id}`,
          priority: overdue ? 'URGENT' : 'HIGH', 
        },
        SYSTEM_SENDER_ID,
      );
      sent++;
    }
    if (sent) this.logger.log(`[Reminder] cabinet=${cabinetId} — ${sent} alerte(s) diligence`);
  }

  // ── Délais de recours (appel / cassation) ────────────────────────────────

  // ── Helpers ──────────────────────────────────────────────────────────────

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

  private dateWindow(days: number): { startToday: Date; inDays: Date } {
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
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
}
