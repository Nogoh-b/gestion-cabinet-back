import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

const DAY_MS = 86_400_000;

export interface MonthRow {
  month: string; // YYYY-MM
  collected: number;
  refunded: number;
  fees: number;
  net: number;
  /** Revenu reconnu : paiements étalés au prorata de la période couverte (hors essai). */
  recognized: number;
  payments: number;
  paying_cabinets: number;
  new_cabinets: number;
  churned_cabinets: number;
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function parseMonth(value: string): Date {
  const m = /^(\d{4})-(\d{2})$/.exec(value ?? '');
  if (!m) throw new BadRequestException('Mois attendu au format AAAA-MM.');
  return new Date(Number(m[1]), Number(m[2]) - 1, 1);
}

function addMonths(date: Date, n: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + n, 1);
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function day(value: string | undefined, end = false): string | null {
  if (!value) return null;
  const d = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new BadRequestException('Date invalide (AAAA-MM-JJ).');
  return `${d} ${end ? '23:59:59' : '00:00:00'}`;
}

/**
 * Indicateurs financiers de la plateforme (tous cabinets).
 *
 *  - Encaissé : montants payés, datés à l'encaissement (`paid_at`).
 *  - Remboursé : datés au remboursement (`refunded_at`).
 *  - Net = encaissé − remboursé − frais de passerelle estimés.
 *  - Revenu reconnu : chaque paiement (net des remboursements) est étalé au
 *    prorata des jours de la période couverte, hors portion d'essai — calcul
 *    rétroactif, sans instantanés.
 *  - MRR : somme mensualisée des abonnements payants en cours (annuel / 12).
 */
@Injectable()
export class PlatformRevenueService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  // ── Synthèse d'une période ────────────────────────────────────────────────

  async overview(fromDate?: string, toDate?: string) {
    const now = new Date();
    const from = day(fromDate) ?? `${monthKey(now)}-01 00:00:00`;
    const to = day(toDate, true) ?? `${now.toISOString().slice(0, 10)} 23:59:59`;
    const span = new Date(to.replace(' ', 'T')).getTime() - new Date(from.replace(' ', 'T')).getTime();
    const prevTo = new Date(new Date(from.replace(' ', 'T')).getTime() - 1000);
    const prevFrom = new Date(prevTo.getTime() - span);
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;

    const [current, previous, mrr, cabinets, subscriptions, due, awaiting, movement] =
      await Promise.all([
        this.cash(from, to),
        this.cash(fmt(prevFrom), fmt(prevTo)),
        this.mrr(),
        this.db.query(
          `SELECT COUNT(*) AS total,
                  SUM(status = 'active') AS active,
                  SUM(status = 'trial') AS trial,
                  SUM(status = 'suspended') AS suspended,
                  SUM(status = 'suspended' AND suspension_reason = 'payment_required') AS suspended_payment,
                  SUM(status = 'suspended' AND suspension_reason = 'expired') AS suspended_expired,
                  SUM(status = 'suspended' AND suspension_reason = 'manual') AS suspended_manual
             FROM cabinets`,
        ),
        this.db.query(
          `SELECT s.status, COUNT(*) AS n FROM subscriptions s
            WHERE s.id IN (SELECT MAX(id) FROM subscriptions WHERE status <> 'cancelled' GROUP BY cabinet_id)
            GROUP BY s.status`,
        ),
        this.db.query(
          `SELECT COUNT(*) AS n, COALESCE(SUM(sp.amount), 0) AS amount
             FROM subscription_payments sp
             JOIN subscriptions s ON s.id = sp.subscription_id
            WHERE sp.status = 'pending' AND sp.amount > 0 AND s.status <> 'cancelled'
              AND sp.kind = 'subscription'`,
        ),
        this.db.query(
          `SELECT COUNT(*) AS n, COALESCE(SUM(amount), 0) AS amount
             FROM subscription_payments WHERE status = 'awaiting_validation'`,
        ),
        this.db.query(
          `SELECT
             (SELECT COUNT(*) FROM cabinets WHERE created_at BETWEEN ? AND ?) AS new_cabinets,
             (SELECT COUNT(DISTINCT cabinet_id) FROM subscription_events
               WHERE type IN ('expired','cancelled') AND created_at BETWEEN ? AND ?) AS churned,
             (SELECT COUNT(DISTINCT cabinet_id) FROM subscription_events
               WHERE type = 'trial_ended' AND created_at BETWEEN ? AND ?) AS trials_ended,
             (SELECT COUNT(DISTINCT sp.cabinet_id) FROM subscription_payments sp
               WHERE sp.status IN ('paid','refunded') AND sp.paid_at BETWEEN ? AND ? AND sp.kind = 'subscription'
                 AND NOT EXISTS (SELECT 1 FROM subscription_payments x
                                  WHERE x.cabinet_id = sp.cabinet_id AND x.status IN ('paid','refunded')
                                    AND x.kind = 'subscription' AND x.paid_at < ?)) AS first_payments`,
          [from, to, from, to, from, to, from, to, from],
        ),
      ]);

    const cab = cabinets[0] ?? {};
    const activeAtStart = Math.max(1, Number(mrr.paying_cabinets) + Number(movement[0]?.churned ?? 0));
    const growth = (a: number, b: number) => (b ? round(((a - b) / b) * 100) : null);
    return {
      period: { from, to },
      cash: {
        ...current,
        previous,
        collected_growth_pct: growth(current.collected, previous.collected),
        net_growth_pct: growth(current.net, previous.net),
      },
      mrr: mrr.mrr,
      arr: round(mrr.mrr * 12),
      paying_cabinets: mrr.paying_cabinets,
      arpa: mrr.paying_cabinets ? round(mrr.mrr / mrr.paying_cabinets) : 0,
      cabinets: Object.fromEntries(Object.entries(cab).map(([k, v]) => [k, Number(v ?? 0)])),
      subscriptions: Object.fromEntries(subscriptions.map((r: any) => [r.status, Number(r.n)])),
      outstanding: {
        due_count: Number(due[0]?.n ?? 0),
        due_amount: Number(due[0]?.amount ?? 0),
        awaiting_count: Number(awaiting[0]?.n ?? 0),
        awaiting_amount: Number(awaiting[0]?.amount ?? 0),
      },
      movement: {
        new_cabinets: Number(movement[0]?.new_cabinets ?? 0),
        churned_cabinets: Number(movement[0]?.churned ?? 0),
        churn_rate_pct: round((Number(movement[0]?.churned ?? 0) / activeAtStart) * 100),
        trials_ended: Number(movement[0]?.trials_ended ?? 0),
        first_payments: Number(movement[0]?.first_payments ?? 0),
      },
    };
  }

  private async cash(from: string, to: string) {
    const [paid] = await this.db.query(
      `SELECT COALESCE(SUM(amount), 0) AS collected,
              COALESCE(SUM(fee_amount), 0) AS fees,
              COUNT(*) AS payments,
              COUNT(DISTINCT cabinet_id) AS cabinets
         FROM subscription_payments
        WHERE status IN ('paid','refunded') AND paid_at BETWEEN ? AND ?`,
      [from, to],
    );
    const [refunds] = await this.db.query(
      `SELECT COALESCE(SUM(refund_amount), 0) AS refunded
         FROM subscription_payments
        WHERE refund_amount IS NOT NULL AND refunded_at BETWEEN ? AND ?`,
      [from, to],
    );
    const collected = Number(paid.collected);
    const refunded = Number(refunds.refunded);
    const fees = Number(paid.fees);
    return {
      collected,
      refunded,
      fees,
      net: round(collected - refunded - fees),
      payments: Number(paid.payments),
      cabinets: Number(paid.cabinets),
    };
  }

  /** MRR contractuel : abonnements payants en cours, mensualisés. */
  async mrr() {
    const rows: Array<{ cabinet_id: number; amount: string; billing_cycle: string }> =
      await this.db.query(
        `SELECT s.cabinet_id, s.amount, s.billing_cycle
           FROM subscriptions s
           JOIN cabinets c ON c.id = s.cabinet_id
          WHERE s.status = 'active' AND s.is_trial = 0 AND s.amount > 0
            AND s.id IN (SELECT MAX(id) FROM subscriptions WHERE status <> 'cancelled' GROUP BY cabinet_id)
            AND NOT (c.status = 'suspended' AND c.suspension_reason = 'manual')`,
      );
    const mrr = rows.reduce(
      (sum, r) => sum + (r.billing_cycle === 'yearly' ? Number(r.amount) / 12 : Number(r.amount)),
      0,
    );
    return { mrr: round(mrr), paying_cabinets: new Set(rows.map((r) => r.cabinet_id)).size };
  }

  // ── Série mensuelle ───────────────────────────────────────────────────────

  async monthly(input: { year?: number; from?: string; months?: number }): Promise<MonthRow[]> {
    let start: Date;
    let count: number;
    if (input.from) {
      start = parseMonth(input.from);
      count = Math.min(36, Math.max(1, Number(input.months) || 12));
    } else {
      const year = Number(input.year) || new Date().getFullYear();
      if (year < 2000 || year > 2100) throw new BadRequestException('Année invalide.');
      start = new Date(year, 0, 1);
      count = 12;
    }
    const end = addMonths(start, count);
    const rows = new Map<string, MonthRow>();
    for (let i = 0; i < count; i++) {
      const key = monthKey(addMonths(start, i));
      rows.set(key, {
        month: key,
        collected: 0,
        refunded: 0,
        fees: 0,
        net: 0,
        recognized: 0,
        payments: 0,
        paying_cabinets: 0,
        new_cabinets: 0,
        churned_cabinets: 0,
      });
    }
    const startSql = `${monthKey(start)}-01 00:00:00`;
    const endSql = `${monthKey(end)}-01 00:00:00`;

    const [paid, refunds, cabinets, churn] = await Promise.all([
      this.db.query(
        `SELECT DATE_FORMAT(paid_at, '%Y-%m') AS m, SUM(amount) AS collected, SUM(fee_amount) AS fees, COUNT(*) AS n
           FROM subscription_payments
          WHERE status IN ('paid','refunded') AND paid_at >= ? AND paid_at < ?
          GROUP BY m`,
        [startSql, endSql],
      ),
      this.db.query(
        `SELECT DATE_FORMAT(refunded_at, '%Y-%m') AS m, SUM(refund_amount) AS refunded
           FROM subscription_payments
          WHERE refund_amount IS NOT NULL AND refunded_at >= ? AND refunded_at < ?
          GROUP BY m`,
        [startSql, endSql],
      ),
      this.db.query(
        `SELECT DATE_FORMAT(created_at, '%Y-%m') AS m, COUNT(*) AS n
           FROM cabinets WHERE created_at >= ? AND created_at < ? GROUP BY m`,
        [startSql, endSql],
      ),
      this.db.query(
        `SELECT DATE_FORMAT(created_at, '%Y-%m') AS m, COUNT(DISTINCT cabinet_id) AS n
           FROM subscription_events
          WHERE type IN ('expired','cancelled') AND created_at >= ? AND created_at < ?
          GROUP BY m`,
        [startSql, endSql],
      ),
    ]);
    for (const r of paid) {
      const row = rows.get(r.m);
      if (row) {
        row.collected = Number(r.collected);
        row.fees = Number(r.fees);
        row.payments = Number(r.n);
      }
    }
    for (const r of refunds) {
      const row = rows.get(r.m);
      if (row) row.refunded = Number(r.refunded);
    }
    for (const r of cabinets) {
      const row = rows.get(r.m);
      if (row) row.new_cabinets = Number(r.n);
    }
    for (const r of churn) {
      const row = rows.get(r.m);
      if (row) row.churned_cabinets = Number(r.n);
    }

    // Revenu reconnu : étalement des paiements chevauchant la fenêtre.
    const payments: Array<any> = await this.db.query(
      `SELECT sp.cabinet_id, sp.amount, sp.refund_amount, sp.paid_at, sp.period_start, sp.period_end,
              s.trial_ends_at
         FROM subscription_payments sp
         LEFT JOIN subscriptions s ON s.id = sp.subscription_id
        WHERE sp.status IN ('paid','refunded') AND sp.amount > 0 AND sp.kind = 'subscription'
          AND (sp.period_end IS NULL OR sp.period_end >= ?)
          AND COALESCE(sp.period_start, sp.paid_at) < ?`,
      [startSql.slice(0, 10), endSql.slice(0, 10)],
    );
    const paying = new Map<string, Set<number>>();
    for (const p of payments) {
      for (const [key, value] of spreadPayment(p)) {
        const row = rows.get(key);
        if (!row) continue;
        row.recognized += value;
        if (!paying.has(key)) paying.set(key, new Set());
        paying.get(key)!.add(Number(p.cabinet_id));
      }
    }
    for (const row of rows.values()) {
      row.recognized = round(row.recognized);
      row.net = round(row.collected - row.refunded - row.fees);
      row.paying_cabinets = paying.get(row.month)?.size ?? 0;
    }
    return [...rows.values()];
  }

  // ── Ventilations ──────────────────────────────────────────────────────────

  async breakdown(by: string, fromDate?: string, toDate?: string) {
    const now = new Date();
    const from = day(fromDate) ?? `${now.getFullYear()}-01-01 00:00:00`;
    const to = day(toDate, true) ?? `${now.toISOString().slice(0, 10)} 23:59:59`;
    const groups: Record<string, { select: string; join: string; group: string }> = {
      plan: {
        select: "COALESCE(p.name, 'Sans plan') AS label, p.id AS key_id",
        join: 'LEFT JOIN subscriptions s ON s.id = sp.subscription_id LEFT JOIN plans p ON p.id = s.plan_id',
        group: 'p.id, p.name',
      },
      method: {
        select:
          "COALESCE(pm.label, sp.provider, sp.method, 'Non renseigné') AS label, COALESCE(pm.code, sp.provider, sp.method) AS key_id",
        join: 'LEFT JOIN platform_payment_methods pm ON pm.id = sp.payment_method_id',
        group: "COALESCE(pm.label, sp.provider, sp.method, 'Non renseigné'), COALESCE(pm.code, sp.provider, sp.method)",
      },
      cabinet: {
        select: 'c.name AS label, c.id AS key_id',
        join: 'JOIN cabinets c ON c.id = sp.cabinet_id',
        group: 'c.id, c.name',
      },
      cycle: {
        select: "COALESCE(s.billing_cycle, 'monthly') AS label, s.billing_cycle AS key_id",
        join: 'LEFT JOIN subscriptions s ON s.id = sp.subscription_id',
        group: 's.billing_cycle',
      },
    };
    const g = groups[by];
    if (!g) throw new BadRequestException('Ventilation inconnue (plan, method, cabinet, cycle).');
    const rows = await this.db.query(
      `SELECT ${g.select},
              COALESCE(SUM(sp.amount), 0) AS collected,
              COALESCE(SUM(sp.refund_amount), 0) AS refunded,
              COUNT(*) AS payments
         FROM subscription_payments sp
         ${g.join}
        WHERE sp.status IN ('paid','refunded') AND sp.paid_at BETWEEN ? AND ?
        GROUP BY ${g.group}
        ORDER BY collected DESC
        LIMIT ${by === 'cabinet' ? 20 : 100}`,
      [from, to],
    );
    const total = rows.reduce((s: number, r: any) => s + Number(r.collected), 0);
    return {
      period: { from, to },
      by,
      total,
      rows: rows.map((r: any) => ({
        key: r.key_id,
        label: r.label,
        collected: Number(r.collected),
        refunded: Number(r.refunded),
        net: round(Number(r.collected) - Number(r.refunded)),
        payments: Number(r.payments),
        share_pct: total ? round((Number(r.collected) / total) * 100) : 0,
      })),
    };
  }

  // ── Tableau de bord ───────────────────────────────────────────────────────

  async dashboard() {
    const now = new Date();
    const fromMonth = monthKey(addMonths(new Date(now.getFullYear(), now.getMonth(), 1), -11));
    const [overview, monthly, byPlan, byMethod, awaiting, expiring, failures, signups] =
      await Promise.all([
        this.overview(),
        this.monthly({ from: fromMonth, months: 12 }),
        this.breakdown('plan', `${now.getFullYear()}-01-01`),
        this.breakdown('method', `${now.getFullYear()}-01-01`),
        this.db.query(
          `SELECT sp.id, sp.amount, sp.currency, sp.declared_at, sp.declared_reference, sp.method,
                  c.id AS cabinet_id, c.name AS cabinet_name
             FROM subscription_payments sp JOIN cabinets c ON c.id = sp.cabinet_id
            WHERE sp.status = 'awaiting_validation'
            ORDER BY sp.declared_at ASC LIMIT 8`,
        ),
        this.db.query(
          `SELECT c.id AS cabinet_id, c.name AS cabinet_name, s.status, s.is_trial, p.name AS plan_name,
                  CASE WHEN s.is_trial = 1 AND s.trial_ends_at IS NOT NULL THEN s.trial_ends_at ELSE s.ends_at END AS due_at
             FROM subscriptions s
             JOIN cabinets c ON c.id = s.cabinet_id
             LEFT JOIN plans p ON p.id = s.plan_id
            WHERE s.status IN ('trial','active')
              AND s.id IN (SELECT MAX(id) FROM subscriptions WHERE status <> 'cancelled' GROUP BY cabinet_id)
              AND (CASE WHEN s.is_trial = 1 AND s.trial_ends_at IS NOT NULL THEN s.trial_ends_at ELSE s.ends_at END)
                  BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 7 DAY)
            ORDER BY due_at ASC LIMIT 8`,
        ),
        this.db.query(
          `SELECT e.id, e.cabinet_id, c.name AS cabinet_name, e.payload, e.created_at
             FROM subscription_events e JOIN cabinets c ON c.id = e.cabinet_id
            WHERE e.type IN ('payment_failed','payment_rejected')
              AND e.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
            ORDER BY e.created_at DESC LIMIT 8`,
        ),
        this.db.query(
          `SELECT c.id AS cabinet_id, c.name AS cabinet_name, c.status, c.created_at, p.name AS plan_name
             FROM cabinets c LEFT JOIN plans p ON p.id = c.plan_id
            ORDER BY c.created_at DESC LIMIT 6`,
        ),
      ]);
    return {
      overview,
      monthly,
      by_plan: byPlan.rows,
      by_method: byMethod.rows,
      todo: {
        awaiting_validation: awaiting.map((r: any) => ({ ...r, amount: Number(r.amount) })),
        expiring_soon: expiring.map((r: any) => ({ ...r, is_trial: !!Number(r.is_trial) })),
        recent_failures: failures.map((r: any) => ({
          ...r,
          payload: typeof r.payload === 'string' ? safeJson(r.payload) : r.payload,
        })),
        recent_signups: signups,
      },
    };
  }

  async exportMonthlyCsv(input: { year?: number; from?: string; months?: number }) {
    const rows = await this.monthly(input);
    const header = [
      'mois', 'encaisse', 'rembourse', 'frais', 'net', 'revenu_reconnu', 'paiements',
      'cabinets_payants', 'nouveaux_cabinets', 'cabinets_perdus',
    ];
    const lines = rows.map((r) =>
      [r.month, r.collected, r.refunded, r.fees, r.net, r.recognized, r.payments,
        r.paying_cabinets, r.new_cabinets, r.churned_cabinets].join(';'),
    );
    return '﻿' + [header.join(';'), ...lines].join('\r\n');
  }
}

function safeJson(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/**
 * Étale le montant net d'un paiement sur les mois de sa période couverte, au
 * prorata des jours, en excluant la portion d'essai. Sans fin de période,
 * tout est reconnu au mois d'encaissement.
 */
export function spreadPayment(p: {
  amount: any;
  refund_amount?: any;
  paid_at?: any;
  period_start?: any;
  period_end?: any;
  trial_ends_at?: any;
}): Map<string, number> {
  const out = new Map<string, number>();
  const net = Number(p.amount) - Number(p.refund_amount ?? 0);
  if (!(net > 0)) return out;
  const toDate = (v: any) => (v ? new Date(v) : null);
  let start = toDate(p.period_start) ?? toDate(p.paid_at);
  const end = toDate(p.period_end);
  const trialEnd = toDate(p.trial_ends_at);
  if (!start) return out;
  if (!end || end.getTime() <= start.getTime()) {
    const at = toDate(p.paid_at) ?? start;
    out.set(monthKey(at), net);
    return out;
  }
  if (trialEnd && trialEnd.getTime() > start.getTime() && trialEnd.getTime() < end.getTime()) {
    start = trialEnd;
  }
  const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const totalDays = Math.max(1, Math.round((endDay.getTime() - startDay.getTime()) / DAY_MS));
  let cursor = startDay;
  while (cursor.getTime() < endDay.getTime()) {
    const nextMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    const sliceEnd = nextMonth.getTime() < endDay.getTime() ? nextMonth : endDay;
    const days = Math.round((sliceEnd.getTime() - cursor.getTime()) / DAY_MS);
    const key = monthKey(cursor);
    out.set(key, (out.get(key) ?? 0) + (net * days) / totalDays);
    cursor = sliceEnd;
  }
  return out;
}
