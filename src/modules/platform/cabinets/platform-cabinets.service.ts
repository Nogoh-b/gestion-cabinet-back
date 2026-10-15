import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TenantContext } from 'src/core/tenant/tenant.context';
import { AuthService } from 'src/core/auth/auth.service';
import { ActivitiesUserService } from 'src/modules/iam/activities-user/activities-user.service';
import { PlansService } from 'src/modules/plans/plans.service';
import { SubscriptionsService } from 'src/modules/subscriptions/subscriptions.service';
import { SubscriptionActor } from 'src/modules/subscriptions/subscription-events.service';
import { PlatformAuditContext } from '../audit/platform-audit.context';
import { PlatformPrincipal } from '../common/platform-principal';
import { PlatformMailerService } from '../common/platform-mailer.service';
import {
  CancelSubscriptionDto,
  ChangeCabinetPlanDto,
  EmailCabinetDto,
  ExtendSubscriptionDto,
  GrantFreePeriodDto,
  PlatformCabinetQueryDto,
} from './dto/platform-cabinet.dto';

/** Acteur « admin plateforme » pour l'historique d'abonnement. */
export function platformActor(admin: PlatformPrincipal): SubscriptionActor {
  return { type: 'platform_admin', id: admin.id, label: admin.email };
}

const SORTS: Record<string, string> = {
  name: 'c.name',
  created_at: 'c.created_at',
  ends_at: 's.ends_at',
  revenue_total: 'revenue_total',
  users_count: 'users_count',
};

/** Abonnement « courant » = le plus récent non annulé (même règle que SubscriptionsService). */
const CURRENT_SUB_JOIN = `
  LEFT JOIN subscriptions s ON s.id = (
    SELECT s2.id FROM subscriptions s2
     WHERE s2.cabinet_id = c.id AND s2.status <> 'cancelled'
     ORDER BY s2.created_at DESC, s2.id DESC LIMIT 1
  )
  LEFT JOIN plans p ON p.id = COALESCE(s.plan_id, c.plan_id)`;

/**
 * Pilotage des cabinets par la plateforme : lecture inter-cabinets (SQL
 * explicite sur les tables plateforme + comptages par tenant_id) et actions
 * d'abonnement déléguées à SubscriptionsService (source unique des règles).
 */
@Injectable()
export class PlatformCabinetsService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly subscriptions: SubscriptionsService,
    private readonly plans: PlansService,
    private readonly tenantContext: TenantContext,
    private readonly activities: ActivitiesUserService,
    private readonly auth: AuthService,
    private readonly mailer: PlatformMailerService,
  ) {}

  // ── Lecture ────────────────────────────────────────────────────────────────

  async list(query: PlatformCabinetQueryDto) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const where: string[] = [];
    const params: any[] = [];

    if (query.search?.trim()) {
      const like = `%${query.search.trim()}%`;
      where.push('(c.name LIKE ? OR c.code LIKE ? OR c.contact_email LIKE ?)');
      params.push(like, like, like);
    }
    if (query.status) {
      where.push('c.status = ?');
      params.push(query.status);
    }
    if (query.suspension_reason) {
      where.push('c.suspension_reason = ?');
      params.push(query.suspension_reason);
    }
    if (query.subscription_status === 'none') {
      where.push('s.id IS NULL');
    } else if (query.subscription_status) {
      where.push('s.status = ?');
      params.push(query.subscription_status);
    }
    if (query.plan_id) {
      where.push('p.id = ?');
      params.push(Number(query.plan_id));
    }
    if (query.expiring_within_days !== undefined && query.expiring_within_days !== null) {
      where.push(
        `s.status IN ('trial','active') AND COALESCE(IF(s.is_trial, s.trial_ends_at, NULL), s.ends_at) BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL ? DAY)`,
      );
      params.push(Number(query.expiring_within_days));
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const sort = SORTS[query.sort_by ?? ''] ?? 'c.created_at';
    const direction = String(query.sort_direction ?? 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const rows = await this.db.query(
      `SELECT c.id, c.code, c.name, c.status, c.suspension_reason, c.suspended_at,
              c.contact_email, c.contact_phone, c.created_at,
              s.id AS subscription_id, s.status AS subscription_status, s.billing_cycle,
              s.started_at, s.ends_at, s.trial_ends_at, s.is_trial, s.amount, s.auto_renew,
              p.id AS plan_id, p.name AS plan_name, p.code AS plan_code,
              (SELECT COUNT(*) FROM \`user\` u WHERE u.tenant_id = c.id AND u.deleted_at IS NULL) AS users_count,
              (SELECT COALESCE(SUM(sp.amount), 0) FROM subscription_payments sp
                WHERE sp.cabinet_id = c.id AND sp.status = 'paid') AS revenue_total,
              (SELECT COUNT(*) FROM subscription_payments sp
                 JOIN subscriptions sx ON sx.id = sp.subscription_id
                WHERE sp.cabinet_id = c.id AND sp.status = 'pending' AND sp.amount > 0
                  AND sx.status <> 'cancelled') AS pending_payments
         FROM cabinets c
         ${CURRENT_SUB_JOIN}
         ${whereSql}
        ORDER BY ${sort} ${direction}, c.id DESC
        LIMIT ? OFFSET ?`,
      [...params, limit, (page - 1) * limit],
    );
    const [{ total }] = await this.db.query(
      `SELECT COUNT(*) AS total FROM cabinets c ${CURRENT_SUB_JOIN} ${whereSql}`,
      params,
    );
    return {
      data: rows.map(normalizeRow),
      meta: {
        total: Number(total),
        page,
        limit,
        totalPages: Math.ceil(Number(total) / limit),
      },
    };
  }

  async detail(cabinetId: number) {
    const [row] = await this.db.query(
      `SELECT c.id, c.code, c.name, c.status, c.suspension_reason, c.suspended_at,
              c.suspended_by_admin_id, c.suspension_note,
              c.contact_email, c.contact_phone, c.address, c.website, c.currency,
              c.app_locale, c.routing_mode, c.created_at, c.updated_at,
              pa.email AS suspended_by_email
         FROM cabinets c
         LEFT JOIN platform_admins pa ON pa.id = c.suspended_by_admin_id
        WHERE c.id = ?`,
      [cabinetId],
    );
    if (!row) throw new NotFoundException('Cabinet introuvable');

    const [subscription, quota, counts, revenue, admins, lastActivity] =
      await Promise.all([
        this.subscriptions.findCurrent(cabinetId),
        this.plans.getQuotaStatus(cabinetId).catch(() => null),
        this.db.query(
          `SELECT
             (SELECT COUNT(*) FROM \`user\` WHERE tenant_id = ? AND deleted_at IS NULL) AS users,
             (SELECT COUNT(*) FROM \`user\` WHERE tenant_id = ? AND deleted_at IS NULL AND status = 1) AS active_users,
             (SELECT COUNT(*) FROM customer WHERE tenant_id = ?) AS clients,
             (SELECT COUNT(*) FROM dossiers WHERE tenant_id = ?) AS dossiers`,
          [cabinetId, cabinetId, cabinetId, cabinetId],
        ),
        this.db.query(
          `SELECT
             COALESCE(SUM(CASE WHEN sp.status = 'paid' THEN sp.amount END), 0) AS paid_total,
             COALESCE(SUM(CASE WHEN sp.status = 'pending' AND s.status <> 'cancelled' THEN sp.amount END), 0) AS pending_total,
             COUNT(CASE WHEN sp.status = 'paid' THEN 1 END) AS paid_count,
             MAX(CASE WHEN sp.status = 'paid' THEN sp.paid_at END) AS last_paid_at
           FROM subscription_payments sp
           LEFT JOIN subscriptions s ON s.id = sp.subscription_id
          WHERE sp.cabinet_id = ?`,
          [cabinetId],
        ),
        this.db.query(
          `SELECT id, email, first_name, last_name, full_name, status, mfa_enabled
             FROM \`user\`
            WHERE tenant_id = ? AND role = 'admin' AND deleted_at IS NULL
            ORDER BY id ASC`,
          [cabinetId],
        ),
        this.db.query(
          `SELECT MAX(created_at) AS last_activity_at FROM activities_user WHERE tenant_id = ?`,
          [cabinetId],
        ),
      ]);

    return {
      ...row,
      subscription,
      quota,
      counts: mapNumbers(counts[0]),
      revenue: {
        ...mapNumbers(revenue[0]),
        last_paid_at: revenue[0]?.last_paid_at ?? null,
      },
      admins: admins.map((a: any) => ({ ...a, mfa_enabled: !!Number(a.mfa_enabled) })),
      last_activity_at: lastActivity[0]?.last_activity_at ?? null,
    };
  }

  events(cabinetId: number) {
    return this.subscriptions.listEvents(cabinetId);
  }

  async payments(cabinetId: number) {
    return this.db.query(
      `SELECT sp.*, s.plan_id, p.name AS plan_name, s.billing_cycle
         FROM subscription_payments sp
         LEFT JOIN subscriptions s ON s.id = sp.subscription_id
         LEFT JOIN plans p ON p.id = s.plan_id
        WHERE sp.cabinet_id = ?
        ORDER BY sp.created_at DESC, sp.id DESC`,
      [cabinetId],
    );
  }

  async users(cabinetId: number) {
    await this.ensureCabinet(cabinetId);
    const rows = await this.db.query(
      `SELECT u.id, u.email, u.username, u.first_name, u.last_name, u.full_name,
              u.role, u.status, u.mfa_enabled, u.is_online, u.lastSeen AS last_seen,
              u.created_at, e.status AS employee_status
         FROM \`user\` u
         LEFT JOIN employee e ON e.id = u.id AND e.tenant_id = u.tenant_id
        WHERE u.tenant_id = ? AND u.deleted_at IS NULL
        ORDER BY (u.role = 'admin') DESC, u.last_name ASC, u.first_name ASC`,
      [cabinetId],
    );
    return rows.map((u: any) => ({
      ...u,
      status: Number(u.status),
      mfa_enabled: !!Number(u.mfa_enabled),
      is_online: !!Number(u.is_online),
      is_blocked: Number(u.status) !== 1,
    }));
  }

  /** Liste des abonnements (courants) — vue transversale. */
  async listSubscriptions(query: PlatformCabinetQueryDto) {
    return this.list(query);
  }

  // ── Actions abonnement ────────────────────────────────────────────────────

  async suspend(cabinetId: number, note: string, admin: PlatformPrincipal) {
    const before = await this.snapshot(cabinetId);
    await this.subscriptions.suspendByPlatform(cabinetId, platformActor(admin), note);
    return this.done(cabinetId, 'cabinet.suspend', before, `Suspension : ${note}`);
  }

  async reactivate(cabinetId: number, admin: PlatformPrincipal) {
    const before = await this.snapshot(cabinetId);
    const res = await this.subscriptions.reactivateByPlatform(cabinetId, platformActor(admin));
    const result = await this.done(
      cabinetId,
      'cabinet.reactivate',
      before,
      res.still_suspended_reason
        ? `Suspension manuelle levée — reste suspendu (${res.still_suspended_reason})`
        : 'Cabinet réactivé',
    );
    return { ...result, still_suspended_reason: res.still_suspended_reason };
  }

  async extend(cabinetId: number, dto: ExtendSubscriptionDto, admin: PlatformPrincipal) {
    if (!dto.days && !dto.until) {
      throw new BadRequestException('Indiquez un nombre de jours ou une date de fin.');
    }
    const before = await this.snapshot(cabinetId);
    await this.subscriptions.extendByPlatform(
      cabinetId,
      { days: dto.days, until: dto.until },
      platformActor(admin),
      dto.note,
    );
    return this.done(
      cabinetId,
      'subscription.extend',
      before,
      dto.days ? `Prolongation de ${dto.days} jour(s)` : `Prolongation jusqu'au ${dto.until}`,
    );
  }

  async grantFreePeriod(cabinetId: number, dto: GrantFreePeriodDto, admin: PlatformPrincipal) {
    const before = await this.snapshot(cabinetId);
    await this.subscriptions.grantFreePeriodByPlatform(
      cabinetId,
      dto.months,
      platformActor(admin),
      dto.note,
    );
    return this.done(cabinetId, 'subscription.free_period', before, `${dto.months} mois offert(s)`);
  }

  async changePlan(cabinetId: number, dto: ChangeCabinetPlanDto, admin: PlatformPrincipal) {
    const before = await this.snapshot(cabinetId);
    await this.subscriptions.changePlanByPlatform(
      cabinetId,
      { planId: dto.plan_id, cycle: dto.cycle, mode: dto.mode },
      platformActor(admin),
    );
    return this.done(
      cabinetId,
      'subscription.change_plan',
      before,
      dto.mode === 'keep_period'
        ? 'Changement de plan sans facturation'
        : 'Changement de plan avec nouvelle période facturée',
    );
  }

  async cancel(cabinetId: number, dto: CancelSubscriptionDto, admin: PlatformPrincipal) {
    const before = await this.snapshot(cabinetId);
    await this.subscriptions.cancelByPlatform(
      cabinetId,
      { reason: dto.reason, immediate: dto.immediate },
      platformActor(admin),
    );
    return this.done(
      cabinetId,
      'subscription.cancel',
      before,
      `${dto.immediate ? 'Résiliation immédiate' : 'Résiliation en fin de période'} : ${dto.reason}`,
    );
  }

  async applyCoupon(cabinetId: number, code: string, admin: PlatformPrincipal) {
    const before = await this.snapshot(cabinetId);
    await this.subscriptions.applyCouponToDuePayment(cabinetId, code, platformActor(admin));
    return this.done(cabinetId, 'coupon.apply', before, `Code promo ${code.toUpperCase()} appliqué`);
  }

  // ── Utilisateurs du cabinet ───────────────────────────────────────────────

  async setUserBlocked(cabinetId: number, userId: number, blocked: boolean) {
    await this.ensureCabinet(cabinetId);
    const before = await this.userSnapshot(cabinetId, userId);
    // actorUserId = 0 : l'admin plateforme n'est pas membre du cabinet.
    const result = await this.tenantContext.run(cabinetId, () =>
      this.activities.setMemberBlocked(userId, blocked, 0),
    );
    PlatformAuditContext.set({
      action: blocked ? 'cabinet_user.block' : 'cabinet_user.unblock',
      targetType: 'cabinet_user',
      targetId: userId,
      cabinetId,
      summary: `${blocked ? 'Blocage' : 'Déblocage'} de ${before.email}`,
      before,
      after: await this.userSnapshot(cabinetId, userId),
    });
    return result;
  }

  async sendPasswordReset(cabinetId: number, userId: number) {
    const user = await this.userSnapshot(cabinetId, userId);
    if (!user.email) throw new BadRequestException("Cet utilisateur n'a pas d'email.");
    await this.tenantContext.run(cabinetId, () =>
      this.auth.forgotPassword({ email: user.email } as any),
    );
    PlatformAuditContext.set({
      action: 'cabinet_user.password_reset',
      targetType: 'cabinet_user',
      targetId: userId,
      cabinetId,
      summary: `Code de réinitialisation envoyé à ${user.email}`,
    });
    return { success: true };
  }

  async disableMfa(cabinetId: number, userId: number) {
    const before = await this.userSnapshot(cabinetId, userId);
    await this.db.query(
      'UPDATE `user` SET mfa_enabled = 0 WHERE id = ? AND tenant_id = ?',
      [userId, cabinetId],
    );
    PlatformAuditContext.set({
      action: 'cabinet_user.disable_mfa',
      targetType: 'cabinet_user',
      targetId: userId,
      cabinetId,
      summary: `Double authentification désactivée pour ${before.email}`,
      before,
      after: await this.userSnapshot(cabinetId, userId),
    });
    return { success: true };
  }

  // ── Communication ─────────────────────────────────────────────────────────

  async email(cabinetId: number, dto: EmailCabinetDto, admin: PlatformPrincipal) {
    const recipients = await this.recipients(cabinetId);
    if (!recipients.length) {
      throw new BadRequestException('Aucune adresse email connue pour ce cabinet.');
    }
    const sent = await this.mailer.send({
      to: recipients,
      subject: dto.subject,
      title: dto.subject,
      paragraphs: dto.message.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean),
    });
    if (!sent) throw new BadRequestException("L'email n'a pas pu être envoyé (SMTP).");
    PlatformAuditContext.set({
      action: 'cabinet.email',
      targetType: 'cabinet',
      targetId: cabinetId,
      cabinetId,
      summary: `Email « ${dto.subject} » envoyé à ${recipients.join(', ')} par ${admin.email}`,
    });
    return { success: true, recipients };
  }

  /** Destinataires d'un cabinet : email de contact + administrateurs actifs. */
  async recipients(cabinetId: number): Promise<string[]> {
    const rows: Array<{ email: string | null }> = await this.db.query(
      `SELECT contact_email AS email FROM cabinets WHERE id = ?
       UNION
       SELECT email FROM \`user\`
        WHERE tenant_id = ? AND role = 'admin' AND status = 1 AND deleted_at IS NULL`,
      [cabinetId, cabinetId],
    );
    return [
      ...new Set(
        rows
          .map((r) => String(r.email ?? '').trim().toLowerCase())
          .filter((e) => /^\S+@\S+\.\S+$/.test(e)),
      ),
    ];
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async ensureCabinet(cabinetId: number) {
    const [row] = await this.db.query('SELECT id FROM cabinets WHERE id = ?', [cabinetId]);
    if (!row) throw new NotFoundException('Cabinet introuvable');
  }

  private async snapshot(cabinetId: number) {
    const [cabinet] = await this.db.query(
      `SELECT id, name, status, suspension_reason, suspension_note, plan_id FROM cabinets WHERE id = ?`,
      [cabinetId],
    );
    if (!cabinet) throw new NotFoundException('Cabinet introuvable');
    const sub = await this.subscriptions.findCurrent(cabinetId);
    return {
      cabinet,
      subscription: sub
        ? {
            id: sub.id,
            status: sub.status,
            plan_id: sub.plan_id,
            billing_cycle: sub.billing_cycle,
            amount: Number(sub.amount),
            is_trial: sub.is_trial,
            trial_ends_at: sub.trial_ends_at,
            ends_at: sub.ends_at,
            auto_renew: sub.auto_renew,
          }
        : null,
    };
  }

  private async done(cabinetId: number, action: string, before: any, summary: string) {
    const after = await this.snapshot(cabinetId);
    PlatformAuditContext.set({
      action,
      targetType: 'cabinet',
      targetId: cabinetId,
      cabinetId,
      summary,
      before,
      after,
    });
    return this.detail(cabinetId);
  }

  private async userSnapshot(cabinetId: number, userId: number) {
    const [user] = await this.db.query(
      `SELECT id, email, role, status, mfa_enabled FROM \`user\`
        WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
      [userId, cabinetId],
    );
    if (!user) throw new NotFoundException('Utilisateur introuvable dans ce cabinet');
    return { ...user, status: Number(user.status), mfa_enabled: !!Number(user.mfa_enabled) };
  }
}

function mapNumbers(row: Record<string, any> = {}) {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(row ?? {})) out[k] = Number(v ?? 0);
  return out;
}

function normalizeRow(r: any) {
  return {
    ...r,
    is_trial: !!Number(r.is_trial),
    auto_renew: r.auto_renew === null ? null : !!Number(r.auto_renew),
    amount: r.amount === null ? null : Number(r.amount),
    users_count: Number(r.users_count ?? 0),
    revenue_total: Number(r.revenue_total ?? 0),
    pending_payments: Number(r.pending_payments ?? 0),
  };
}
