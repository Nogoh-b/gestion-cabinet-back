import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { SubscriptionsService } from 'src/modules/subscriptions/subscriptions.service';
import { PlatformAuditContext } from '../audit/platform-audit.context';
import { PlatformPrincipal } from '../common/platform-principal';
import { platformActor } from '../cabinets/platform-cabinets.service';
import {
  PlatformPaymentQueryDto,
  RecordPaymentDto,
  RefundPaymentDto,
  ValidatePaymentDto,
} from './dto/platform-payment.dto';

const DATE_FIELDS: Record<string, string> = {
  paid_at: 'sp.paid_at',
  created_at: 'sp.created_at',
  refunded_at: 'sp.refunded_at',
  due_date: 'sp.due_date',
};

const PAYMENT_COLUMNS = `
  sp.id, sp.subscription_id, sp.cabinet_id, sp.amount, sp.amount_gross, sp.discount_amount,
  sp.fee_amount, sp.currency, sp.status, sp.due_date, sp.paid_at, sp.period_start, sp.period_end,
  sp.method, sp.provider, sp.reference, sp.provider_reference, sp.checkout_url, sp.failure_reason,
  sp.declared_reference, sp.declared_at, (sp.proof_file IS NOT NULL) AS has_proof,
  sp.validated_at, sp.refunded_at, sp.refund_amount, sp.refund_reason, sp.receipt_number,
  sp.notes, sp.created_at, sp.updated_at,
  c.name AS cabinet_name, c.code AS cabinet_code,
  p.name AS plan_name, s.billing_cycle, s.status AS subscription_status,
  pm.label AS method_label, pa.email AS validated_by_email`;

const PAYMENT_JOINS = `
  FROM subscription_payments sp
  JOIN cabinets c ON c.id = sp.cabinet_id
  LEFT JOIN subscriptions s ON s.id = sp.subscription_id
  LEFT JOIN plans p ON p.id = s.plan_id
  LEFT JOIN platform_payment_methods pm ON pm.id = sp.payment_method_id
  LEFT JOIN platform_admins pa ON pa.id = sp.validated_by_admin_id`;

function normalize(row: any) {
  return {
    ...row,
    amount: Number(row.amount),
    amount_gross: row.amount_gross === null ? null : Number(row.amount_gross),
    discount_amount: Number(row.discount_amount ?? 0),
    fee_amount: Number(row.fee_amount ?? 0),
    refund_amount: row.refund_amount === null ? null : Number(row.refund_amount),
    has_proof: !!Number(row.has_proof),
  };
}

/** Paiements d'abonnement vus par la plateforme (tous cabinets). */
@Injectable()
export class PlatformPaymentsService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  private where(query: PlatformPaymentQueryDto) {
    const where: string[] = [];
    const params: any[] = [];
    if (query.status === 'due') {
      where.push("sp.status = 'pending' AND sp.amount > 0 AND s.status <> 'cancelled'");
    } else if (query.status) {
      where.push('sp.status = ?');
      params.push(query.status);
    }
    if (query.method) {
      where.push('sp.method = ?');
      params.push(query.method);
    }
    if (query.provider) {
      where.push('sp.provider = ?');
      params.push(query.provider);
    }
    if (query.cabinet_id) {
      where.push('sp.cabinet_id = ?');
      params.push(Number(query.cabinet_id));
    }
    if (query.search?.trim()) {
      const like = `%${query.search.trim()}%`;
      where.push(
        '(c.name LIKE ? OR sp.reference LIKE ? OR sp.declared_reference LIKE ? OR sp.receipt_number LIKE ?)',
      );
      params.push(like, like, like, like);
    }
    const field = DATE_FIELDS[query.date_field ?? 'paid_at'] ?? 'sp.paid_at';
    if (query.from) {
      where.push(`${field} >= ?`);
      params.push(`${query.from.slice(0, 10)} 00:00:00`);
    }
    if (query.to) {
      where.push(`${field} <= ?`);
      params.push(`${query.to.slice(0, 10)} 23:59:59`);
    }
    return { sql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
  }

  async list(query: PlatformPaymentQueryDto) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(query.limit) || 25));
    const { sql, params } = this.where(query);
    const rows = await this.db.query(
      `SELECT ${PAYMENT_COLUMNS} ${PAYMENT_JOINS} ${sql}
        ORDER BY COALESCE(sp.paid_at, sp.declared_at, sp.created_at) DESC, sp.id DESC
        LIMIT ? OFFSET ?`,
      [...params, limit, (page - 1) * limit],
    );
    const [totals] = await this.db.query(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(sp.amount), 0) AS amount_total,
              COALESCE(SUM(sp.refund_amount), 0) AS refunded_total
         ${PAYMENT_JOINS} ${sql}`,
      params,
    );
    const [counters] = await this.db.query(
      `SELECT
         SUM(sp.status = 'awaiting_validation') AS awaiting_validation,
         SUM(sp.status = 'pending' AND sp.amount > 0 AND s.status <> 'cancelled') AS due
         ${PAYMENT_JOINS}`,
    );
    return {
      data: rows.map(normalize),
      meta: {
        total: Number(totals.total),
        page,
        limit,
        totalPages: Math.ceil(Number(totals.total) / limit),
        amount_total: Number(totals.amount_total),
        refunded_total: Number(totals.refunded_total),
        awaiting_validation: Number(counters.awaiting_validation ?? 0),
        due: Number(counters.due ?? 0),
      },
    };
  }

  async detail(id: number) {
    const [row] = await this.db.query(
      `SELECT ${PAYMENT_COLUMNS}, sp.provider_payload ${PAYMENT_JOINS} WHERE sp.id = ?`,
      [id],
    );
    if (!row) throw new NotFoundException('Paiement introuvable');
    const webhooks = await this.db.query(
      `SELECT id, provider, event_id, signature_valid, processed_at, error, created_at
         FROM payment_webhook_events WHERE payment_id = ? ORDER BY id DESC LIMIT 20`,
      [id],
    );
    return { ...normalize(row), webhooks };
  }

  async validate(id: number, dto: ValidatePaymentDto, admin: PlatformPrincipal) {
    const before = await this.detail(id);
    await this.subscriptions.validatePaymentByPlatform(id, platformActor(admin), dto);
    return this.done(id, 'payment.validate', before, `Paiement #${id} validé (${before.amount} ${before.currency})`);
  }

  async reject(id: number, reason: string, admin: PlatformPrincipal) {
    const before = await this.detail(id);
    await this.subscriptions.rejectPaymentByPlatform(id, platformActor(admin), reason);
    return this.done(id, 'payment.reject', before, `Déclaration rejetée : ${reason}`);
  }

  async refund(id: number, dto: RefundPaymentDto, admin: PlatformPrincipal) {
    const before = await this.detail(id);
    await this.subscriptions.refundPaymentByPlatform(id, platformActor(admin), {
      amount: dto.amount,
      reason: dto.reason,
      viaProvider: dto.via_provider,
    });
    return this.done(id, 'payment.refund', before, `Remboursement : ${dto.reason}`);
  }

  async waive(id: number, reason: string, admin: PlatformPrincipal) {
    const before = await this.detail(id);
    await this.subscriptions.waivePaymentByPlatform(id, platformActor(admin), reason);
    return this.done(id, 'payment.waive', before, `Échéance annulée : ${reason}`);
  }

  async record(cabinetId: number, dto: RecordPaymentDto, admin: PlatformPrincipal) {
    const payment = await this.subscriptions.recordPaymentByPlatform(cabinetId, platformActor(admin), {
      paymentId: dto.payment_id,
      methodCode: dto.method_code,
      reference: dto.reference,
      paidAt: dto.paid_at,
      note: dto.note,
    });
    const after = await this.detail(payment.id);
    PlatformAuditContext.set({
      action: 'payment.record',
      targetType: 'payment',
      targetId: payment.id,
      cabinetId,
      summary: `Encaissement enregistré : ${after.amount} ${after.currency} (${after.method})`,
      after,
    });
    return after;
  }

  proof(id: number) {
    return this.subscriptions.proofFile(id);
  }

  /** Export CSV (séparateur `;`, UTF-8 avec BOM pour Excel). */
  async exportCsv(query: PlatformPaymentQueryDto): Promise<string> {
    const { sql, params } = this.where(query);
    const rows = await this.db.query(
      `SELECT ${PAYMENT_COLUMNS} ${PAYMENT_JOINS} ${sql}
        ORDER BY COALESCE(sp.paid_at, sp.created_at) DESC, sp.id DESC
        LIMIT 20000`,
      params,
    );
    const header = [
      'id', 'cabinet', 'code_cabinet', 'plan', 'cycle', 'statut', 'montant', 'devise',
      'remise', 'frais', 'rembourse', 'moyen', 'passerelle', 'reference', 'reference_declaree',
      'recu', 'echeance', 'periode_debut', 'periode_fin', 'paye_le', 'rembourse_le', 'cree_le',
    ];
    const iso = (d: any) => (d ? new Date(d).toISOString().slice(0, 19).replace('T', ' ') : '');
    const day = (d: any) => (d ? new Date(d).toISOString().slice(0, 10) : '');
    const cell = (v: any) => {
      const text = v === null || v === undefined ? '' : String(v);
      return /[;"\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const lines = rows.map((r: any) =>
      [
        r.id, r.cabinet_name, r.cabinet_code, r.plan_name, r.billing_cycle, r.status,
        Number(r.amount), r.currency, Number(r.discount_amount ?? 0), Number(r.fee_amount ?? 0),
        r.refund_amount ?? '', r.method, r.provider, r.reference, r.declared_reference,
        r.receipt_number, day(r.due_date), day(r.period_start), day(r.period_end),
        iso(r.paid_at), iso(r.refunded_at), iso(r.created_at),
      ].map(cell).join(';'),
    );
    return '﻿' + [header.join(';'), ...lines].join('\r\n');
  }

  async webhookEvents(limit = 100) {
    return this.db.query(
      `SELECT id, provider, event_id, payment_id, reference, signature_valid, processed_at, error, created_at
         FROM payment_webhook_events ORDER BY id DESC LIMIT ?`,
      [Math.min(500, Math.max(1, limit))],
    );
  }

  private async done(id: number, action: string, before: any, summary: string) {
    const after = await this.detail(id);
    PlatformAuditContext.set({
      action,
      targetType: 'payment',
      targetId: id,
      cabinetId: after.cabinet_id,
      summary,
      before,
      after,
    });
    return after;
  }
}
