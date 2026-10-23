import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { Plan } from '../entities/plan.entity';
import { PlanQuotaService } from '../plan-quota.service';
import { AiCreditPack } from './ai-credit-pack.entity';
import {
  AI_CREDITS_SETTING_KEY,
  AiCreditSettings,
  AiCreditStatus,
  CreditPosition,
  creditPosition,
  isUnlimitedAllowance,
  overflowToCharge,
  packPlanPct,
  parseCreditSettings,
  periodBounds,
  previousPeriod,
  publicStatus,
  toCredits,
  toUsd,
  validateUsdPerCredit,
} from './ai-credits';

const num = (value: unknown) => Number(value ?? 0) || 0;

export interface PackInput {
  name?: string;
  credits?: number;
  price?: number;
  currency?: string;
  description?: string | null;
  is_active?: boolean;
  sort_order?: number;
}

/**
 * Crédits IA d'un cabinet : consommation du mois (somme des coûts de
 * `ai_request_calls` convertis en crédits), forfait du plan et crédits achetés
 * (`ai_credit_ledger`). Le cabinet n'obtient que des pourcentages (`status`).
 */
@Injectable()
export class AiCreditsService {
  private readonly logger = new Logger(AiCreditsService.name);
  private settings: { value: AiCreditSettings; expiresAt: number } | null = null;

  constructor(
    @InjectDataSource() private readonly db: DataSource,
    @InjectRepository(AiCreditPack)
    private readonly packs: Repository<AiCreditPack>,
    private readonly planQuota: PlanQuotaService,
  ) {}

  // ── Réglage plateforme ───────────────────────────────────────────────────

  async loadSettings(): Promise<AiCreditSettings> {
    if (this.settings && this.settings.expiresAt > Date.now()) return this.settings.value;
    const rows: Array<{ value: unknown }> = await this.db.query(
      'SELECT `value` FROM platform_settings WHERE `key` = ? LIMIT 1',
      [AI_CREDITS_SETTING_KEY],
    );
    const value = parseCreditSettings(rows?.[0]?.value);
    this.settings = { value, expiresAt: Date.now() + 60_000 };
    return value;
  }

  async setUsdPerCredit(raw: unknown, adminId?: number): Promise<AiCreditSettings> {
    let usd: number;
    try {
      usd = validateUsdPerCredit(raw);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
    const value: AiCreditSettings = { usd_per_credit: usd };
    await this.db.query(
      `INSERT INTO platform_settings (\`key\`, \`value\`, updated_by_admin_id)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE \`value\` = VALUES(\`value\`), updated_by_admin_id = VALUES(updated_by_admin_id), updated_at = CURRENT_TIMESTAMP`,
      [AI_CREDITS_SETTING_KEY, JSON.stringify(value), adminId ?? null],
    );
    this.settings = null;
    return value;
  }

  // ── Position d'un cabinet ────────────────────────────────────────────────

  /** Crédits consommés par le cabinet sur le mois civil de `now`. */
  async monthUsed(tenantId: number, now = new Date()): Promise<number> {
    const start = PlanQuotaService.monthStart(now);
    const end = PlanQuotaService.nextMonthStart(now);
    const [rows, settings] = await Promise.all([
      this.db.query(
        `SELECT COALESCE(SUM(cost_usd), 0) AS cost FROM ai_request_calls
          WHERE tenant_id = ? AND created_at >= ? AND created_at < ?`,
        [tenantId, start, end],
      ),
      this.loadSettings(),
    ]);
    return toCredits(rows?.[0]?.cost, settings.usd_per_credit);
  }

  private async ledgerSums(tenantId: number): Promise<{ balance: number; granted: number }> {
    const rows = await this.db.query(
      `SELECT COALESCE(SUM(credits), 0) AS balance,
              COALESCE(SUM(CASE WHEN kind IN ('purchase','grant') AND credits > 0 THEN credits END), 0) AS granted
         FROM ai_credit_ledger WHERE tenant_id = ?`,
      [tenantId],
    );
    return { balance: num(rows?.[0]?.balance), granted: num(rows?.[0]?.granted) };
  }

  /**
   * Position complète du cabinet (en crédits : réservé à la plateforme).
   * `plan` peut être fourni pour éviter de le relire (garde, widget).
   */
  async position(tenantId: number, plan?: Plan | null, now = new Date()): Promise<CreditPosition> {
    const resolved = plan === undefined ? await this.planQuota.getCabinetPlan(tenantId) : plan;
    const [used, sums] = await Promise.all([this.monthUsed(tenantId, now), this.ledgerSums(tenantId)]);
    return creditPosition({
      allowance: resolved?.ai_credits_per_month,
      used,
      balance: sums.balance,
      granted: sums.granted,
    });
  }

  /** Pourcentages seulement : c'est tout ce que le cabinet doit voir. */
  async status(tenantId: number, plan?: Plan | null, now = new Date()): Promise<AiCreditStatus> {
    return publicStatus(await this.position(tenantId, plan, now), PlanQuotaService.nextMonthStart(now));
  }

  /** Vrai si le cabinet a épuisé son forfait du mois et ses crédits achetés. */
  async isExhausted(tenantId: number, plan?: Plan | null): Promise<boolean> {
    const resolved = plan === undefined ? await this.planQuota.getCabinetPlan(tenantId) : plan;
    if (isUnlimitedAllowance(resolved?.ai_credits_per_month)) return false;
    return (await this.position(tenantId, resolved)).exhausted;
  }

  /** Vue chiffrée pour la plateforme (crédits, équivalent en USD). */
  async detail(tenantId: number) {
    const [plan, settings] = await Promise.all([
      this.planQuota.getCabinetPlan(tenantId),
      this.loadSettings(),
    ]);
    const position = await this.position(tenantId, plan);
    const usd = settings.usd_per_credit;
    return {
      usd_per_credit: usd,
      unlimited: position.unlimited,
      allowance: position.unlimited ? null : position.allowance,
      used: position.used,
      used_usd: toUsd(position.used, usd),
      overflow: position.overflow,
      extra_left: position.extraLeft,
      granted: position.granted,
      exhausted: position.exhausted,
      resets_at: PlanQuotaService.nextMonthStart().toISOString(),
    };
  }

  // ── Écritures du ledger ──────────────────────────────────────────────────

  /**
   * Crédite un achat. Idempotent : `payment_id` est unique, un second appel
   * pour le même paiement ne crédite rien. Renvoie vrai si la ligne est créée.
   */
  async creditPurchase(input: {
    tenantId: number;
    paymentId: number;
    credits: number;
    note?: string;
  }): Promise<boolean> {
    if (!(input.credits > 0)) return false;
    const result: any = await this.db.query(
      `INSERT IGNORE INTO ai_credit_ledger (tenant_id, kind, credits, payment_id, note)
       VALUES (?, 'purchase', ?, ?, ?)`,
      [input.tenantId, input.credits, input.paymentId, (input.note ?? 'Achat de crédits IA').slice(0, 255)],
    );
    return num(result?.affectedRows) === 1;
  }

  /** Attribution manuelle de la plateforme (crédits offerts, geste commercial). */
  async grant(tenantId: number, credits: number, note: string | undefined, adminId?: number) {
    const amount = Math.round(Number(credits) * 1e4) / 1e4;
    if (!Number.isFinite(amount) || amount <= 0 || amount > 100_000_000) {
      throw new BadRequestException('Le nombre de crédits doit être positif.');
    }
    const cabinet = await this.db.query('SELECT id FROM cabinets WHERE id = ? LIMIT 1', [tenantId]);
    if (!cabinet.length) throw new NotFoundException(`Cabinet #${tenantId} introuvable`);
    await this.db.query(
      `INSERT INTO ai_credit_ledger (tenant_id, kind, credits, note, created_by) VALUES (?, 'grant', ?, ?, ?)`,
      [tenantId, amount, (note?.trim() || 'Attribution par la plateforme').slice(0, 255), adminId ?? null],
    );
    return this.detail(tenantId);
  }

  /** Retire les crédits d'un achat remboursé (au prorata du montant remboursé). */
  async refundPurchase(input: { tenantId: number; paymentId: number; credits: number; note?: string }) {
    if (!(input.credits > 0)) return;
    await this.db.query(
      `INSERT INTO ai_credit_ledger (tenant_id, kind, credits, note) VALUES (?, 'refund', ?, ?)`,
      [
        input.tenantId,
        -Math.round(input.credits * 1e4) / 1e4,
        (input.note ?? `Remboursement du paiement #${input.paymentId}`).slice(0, 255),
      ],
    );
  }

  // ── Dépassement mensuel ──────────────────────────────────────────────────

  /**
   * Écrit, pour chaque cabinet qui a dépassé son forfait sur `period`, le
   * dépassement puisé dans ses crédits achetés. Idempotent : une ligne
   * `overflow` par cabinet et par mois (clé unique), même à zéro, pour qu'un
   * achat ultérieur ne soit pas amputé par un nouveau passage.
   */
  async settleMonth(period: string): Promise<{ period: string; settled: number }> {
    const { start, end } = periodBounds(period);
    const settings = await this.loadSettings();
    const rows: Array<{ tenant_id: number; cost: string; allowance: number | null }> = await this.db.query(
      `SELECT c.tenant_id, SUM(c.cost_usd) AS cost, p.ai_credits_per_month AS allowance
         FROM ai_request_calls c
         JOIN cabinets cab ON cab.id = c.tenant_id
         LEFT JOIN plans p ON p.id = cab.plan_id
        WHERE c.tenant_id > 0 AND c.created_at >= ? AND c.created_at < ? AND c.cost_usd IS NOT NULL
        GROUP BY c.tenant_id, p.ai_credits_per_month`,
      [start, end],
    );
    let settled = 0;
    for (const row of rows) {
      if (isUnlimitedAllowance(row.allowance)) continue;
      const overflow = toCredits(row.cost, settings.usd_per_credit) - Number(row.allowance);
      if (overflow <= 0) continue;
      try {
        const tenantId = num(row.tenant_id);
        const exists = await this.db.query(
          `SELECT 1 FROM ai_credit_ledger WHERE tenant_id = ? AND kind = 'overflow' AND period = ? LIMIT 1`,
          [tenantId, period],
        );
        if (exists.length) continue;
        const { balance } = await this.ledgerSums(tenantId);
        const charge = overflowToCharge(overflow, balance);
        const result: any = await this.db.query(
          `INSERT IGNORE INTO ai_credit_ledger (tenant_id, kind, credits, period, note) VALUES (?, 'overflow', ?, ?, ?)`,
          [tenantId, -charge, period, `Consommation au-delà du forfait (${period})`],
        );
        if (num(result?.affectedRows) === 1) settled++;
      } catch (error) {
        this.logger.warn(`Dépassement ${period} cabinet ${row.tenant_id} non écrit : ${(error as Error).message}`);
      }
    }
    return { period, settled };
  }

  /** 1er du mois (puis rattrapage les 2 et 3) : règle le mois écoulé, idempotent. */
  @Cron('0 10 0 1-3 * *')
  async settlePreviousMonth(): Promise<void> {
    try {
      const result = await this.settleMonth(previousPeriod());
      if (result.settled) this.logger.log(`Dépassements IA ${result.period} : ${result.settled} cabinet(s)`);
    } catch (error) {
      this.logger.error(`Règlement des crédits IA impossible : ${(error as Error).message}`);
    }
  }

  // ── Packs ────────────────────────────────────────────────────────────────

  listPacks(onlyActive = false) {
    return this.packs.find({
      where: onlyActive ? { is_active: true } : {},
      order: { sort_order: 'ASC', credits: 'ASC', id: 'ASC' },
    });
  }

  async findPack(id: number): Promise<AiCreditPack> {
    const pack = await this.packs.findOne({ where: { id } });
    if (!pack) throw new NotFoundException(`Pack #${id} introuvable`);
    return pack;
  }

  private checkPack(pack: AiCreditPack) {
    if (!pack.name?.trim()) throw new BadRequestException('Le nom du pack est obligatoire.');
    if (!Number.isInteger(Number(pack.credits)) || Number(pack.credits) < 1) {
      throw new BadRequestException('Le pack doit contenir au moins 1 crédit.');
    }
    if (!(Number(pack.price) > 0)) throw new BadRequestException('Le prix du pack doit être positif.');
  }

  async createPack(input: PackInput): Promise<AiCreditPack> {
    const pack = this.packs.create({
      name: String(input.name ?? '').trim(),
      credits: Number(input.credits),
      price: Number(input.price),
      currency: (input.currency ?? 'XAF').toUpperCase().slice(0, 10),
      description: input.description?.trim() || null,
      is_active: input.is_active ?? true,
      sort_order: input.sort_order ?? 0,
    });
    this.checkPack(pack);
    return this.packs.save(pack);
  }

  async updatePack(id: number, input: PackInput): Promise<AiCreditPack> {
    const pack = await this.findPack(id);
    if (input.name !== undefined) pack.name = String(input.name).trim();
    if (input.credits !== undefined) pack.credits = Number(input.credits);
    if (input.price !== undefined) pack.price = Number(input.price);
    if (input.currency !== undefined) pack.currency = String(input.currency).toUpperCase().slice(0, 10);
    if (input.description !== undefined) pack.description = input.description?.trim() || null;
    if (input.is_active !== undefined) pack.is_active = !!input.is_active;
    if (input.sort_order !== undefined) pack.sort_order = Number(input.sort_order);
    this.checkPack(pack);
    return this.packs.save(pack);
  }

  /** Supprime un pack jamais acheté ; sinon il faut le désactiver. */
  async removePack(id: number): Promise<void> {
    await this.findPack(id);
    const used = await this.db.query(
      'SELECT COUNT(*) AS n FROM subscription_payments WHERE ai_credit_pack_id = ?',
      [id],
    );
    if (num(used?.[0]?.n) > 0) {
      throw new ConflictException('Ce pack a déjà été acheté : désactivez-le plutôt que de le supprimer.');
    }
    await this.packs.delete(id);
  }

  /**
   * Packs proposés au cabinet : nom, prix et « ≈ +N % du forfait mensuel »,
   * jamais le nombre de crédits.
   */
  async packsForCabinet(tenantId: number) {
    const [packs, plan] = await Promise.all([this.listPacks(true), this.planQuota.getCabinetPlan(tenantId)]);
    return packs.map((pack) => ({
      id: pack.id,
      name: pack.name,
      description: pack.description,
      price: Number(pack.price),
      currency: pack.currency,
      plan_pct: packPlanPct(pack.credits, plan?.ai_credits_per_month),
    }));
  }
}
