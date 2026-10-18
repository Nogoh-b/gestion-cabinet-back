import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AiModelRouterService } from 'src/core/ai-database/ai-model-router.service';
import { AiUsageService } from 'src/core/ai-database/ai-usage.service';
import {
  AiPricingStore,
  findPrice,
  PLATFORM_AI_PRICING_KEY,
  removePrice,
  upsertPrice,
  validatePriceInput,
} from 'src/core/ai-database/ai-usage';
import { parseStoredAiConfig, PLATFORM_AI_SETTING_KEY } from 'src/core/ai-database/ai-provider-config';
import { PlatformAuditContext } from '../audit/platform-audit.context';

const MAX_RANGE_DAYS = 366;
const DAY_MS = 86_400_000;
const RANGE = 'created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 DAY)';

export interface UsagePeriod {
  from: string;
  to: string;
}

/** Période demandée (AAAA-MM-JJ), par défaut le mois en cours ; 366 jours au plus. */
export function usagePeriod(fromRaw?: string, toRaw?: string, now = new Date()): UsagePeriod {
  const iso = (date: Date) => date.toISOString().slice(0, 10);
  const parse = (value: string | undefined, field: string) => {
    if (!value) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
      throw new BadRequestException(`Date « ${field} » invalide (format AAAA-MM-JJ)`);
    }
    return value;
  };
  const today = iso(now);
  const to = parse(toRaw, 'au') ?? today;
  const from = parse(fromRaw, 'du') ?? `${today.slice(0, 7)}-01`;
  if (from > to) throw new BadRequestException('La date de début doit précéder la date de fin');
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS + 1;
  if (days > MAX_RANGE_DAYS) throw new BadRequestException(`Période limitée à ${MAX_RANGE_DAYS} jours`);
  return { from, to };
}

/** Une ligne par jour de la période, même sans activité (courbe continue). */
export function fillDays<T extends { day: string }>(period: UsagePeriod, rows: T[], empty: (day: string) => T): T[] {
  const byDay = new Map(rows.map((row) => [row.day, row]));
  const days: T[] = [];
  for (let t = Date.parse(`${period.from}T00:00:00Z`); t <= Date.parse(`${period.to}T00:00:00Z`); t += DAY_MS) {
    const day = new Date(t).toISOString().slice(0, 10);
    days.push(byDay.get(day) ?? empty(day));
  }
  return days;
}

const num = (value: unknown) => Number(value ?? 0) || 0;
const money = (value: unknown) => (value === null || value === undefined ? 0 : Math.round(Number(value) * 1e6) / 1e6);
const dayKey = (value: unknown) =>
  value instanceof Date
    ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
    : String(value).slice(0, 10);

interface CallTotals {
  calls: number;
  input_tokens: number;
  output_tokens: number;
  cached_input_tokens: number;
  cost_usd: number;
  unpriced_calls: number;
  estimated_calls: number;
}

/**
 * Consommation IA vue de la plateforme : requêtes (`ai_request_log`), tokens
 * et coût par appel de modèle (`ai_request_calls`), par cabinet, modèle, jour,
 * type de demande et utilisateur. Les coûts sont en USD, aux tarifs saisis ici.
 */
@Injectable()
export class PlatformAiUsageService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly router: AiModelRouterService,
    private readonly usage: AiUsageService,
  ) {}

  async overview(fromRaw?: string, toRaw?: string) {
    const period = usagePeriod(fromRaw, toRaw);
    const args = [period.from, period.to];
    const [requests, calls, requestDays, callDays, requestCabinets, callCabinets, models, intents, monthRequests] =
      await Promise.all([
        this.db.query(
          `SELECT COUNT(*) requests, SUM(status = 'error') errors, AVG(total_ms) avg_ms,
                  COUNT(DISTINCT tenant_id) cabinets, COUNT(DISTINCT tenant_id, user_id) users
             FROM ai_request_log WHERE ${RANGE}`,
          args,
        ),
        this.callTotals('', args),
        this.db.query(
          `SELECT DATE(created_at) day, COUNT(*) requests, SUM(status = 'error') errors
             FROM ai_request_log WHERE ${RANGE} GROUP BY DATE(created_at)`,
          args,
        ),
        this.callDays('', args),
        this.db.query(
          `SELECT tenant_id, COUNT(*) requests, SUM(status = 'error') errors,
                  COUNT(DISTINCT user_id) users, AVG(total_ms) avg_ms, MAX(created_at) last_request_at
             FROM ai_request_log WHERE ${RANGE} GROUP BY tenant_id`,
          args,
        ),
        this.db.query(
          `SELECT tenant_id, COUNT(*) calls, SUM(input_tokens) input_tokens, SUM(output_tokens) output_tokens,
                  SUM(cost_usd) cost_usd, SUM(cost_usd IS NULL) unpriced_calls
             FROM ai_request_calls WHERE ${RANGE} GROUP BY tenant_id`,
          args,
        ),
        this.modelRows('', args),
        this.intentRows('', args),
        // Quota du plan : compté sur le mois civil en cours, comme le garde.
        this.db.query(
          `SELECT tenant_id, COUNT(*) requests FROM ai_request_log
            WHERE created_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01') GROUP BY tenant_id`,
        ),
      ]);

    const tenantIds = [
      ...new Set([...requestCabinets, ...callCabinets].map((row: any) => num(row.tenant_id))),
    ];
    const cabinets = await this.cabinetInfo(tenantIds);
    const month = new Map(monthRequests.map((row: any) => [num(row.tenant_id), num(row.requests)]));
    const callsByTenant = new Map(callCabinets.map((row: any) => [num(row.tenant_id), row]));
    const requestsByTenant = new Map(requestCabinets.map((row: any) => [num(row.tenant_id), row]));

    return {
      period,
      currency: 'USD',
      totals: {
        requests: num(requests[0]?.requests),
        errors: num(requests[0]?.errors),
        avg_ms: Math.round(num(requests[0]?.avg_ms)),
        cabinets: num(requests[0]?.cabinets),
        users: num(requests[0]?.users),
        ...calls,
      },
      daily: this.mergeDays(period, requestDays, callDays),
      cabinets: tenantIds
        .map((tenantId) => {
          const request: any = requestsByTenant.get(tenantId) ?? {};
          const call: any = callsByTenant.get(tenantId) ?? {};
          const info = cabinets.get(tenantId);
          return {
            cabinet_id: tenantId,
            name: tenantId === 0 ? 'Plateforme (hors cabinet)' : (info?.name ?? `Cabinet #${tenantId}`),
            plan_name: info?.plan_name ?? null,
            requests: num(request.requests),
            errors: num(request.errors),
            users: num(request.users),
            avg_ms: Math.round(num(request.avg_ms)),
            last_request_at: request.last_request_at ?? null,
            calls: num(call.calls),
            input_tokens: num(call.input_tokens),
            output_tokens: num(call.output_tokens),
            cost_usd: money(call.cost_usd),
            unpriced_calls: num(call.unpriced_calls),
            month_requests: month.get(tenantId) ?? 0,
            month_limit: info?.ai_limit ?? null,
          };
        })
        .sort((a, b) => b.cost_usd - a.cost_usd || b.requests - a.requests),
      models: await this.withPrices(models),
      intents,
      pricing: await this.pricingList(),
    };
  }

  async cabinetDetail(cabinetId: number, fromRaw?: string, toRaw?: string) {
    if (!Number.isInteger(cabinetId) || cabinetId < 0) throw new BadRequestException('Cabinet invalide');
    const period = usagePeriod(fromRaw, toRaw);
    const info = (await this.cabinetInfo([cabinetId])).get(cabinetId);
    if (cabinetId !== 0 && !info) throw new NotFoundException(`Cabinet #${cabinetId} introuvable`);
    const args = [cabinetId, period.from, period.to];
    const tenant = 'tenant_id = ? AND';
    const [requests, calls, requestDays, callDays, models, intents, userRequests, userCalls, recent] =
      await Promise.all([
        this.db.query(
          `SELECT COUNT(*) requests, SUM(status = 'error') errors, AVG(total_ms) avg_ms, COUNT(DISTINCT user_id) users
             FROM ai_request_log WHERE ${tenant} ${RANGE}`,
          args,
        ),
        this.callTotals(tenant, args),
        this.db.query(
          `SELECT DATE(created_at) day, COUNT(*) requests, SUM(status = 'error') errors
             FROM ai_request_log WHERE ${tenant} ${RANGE} GROUP BY DATE(created_at)`,
          args,
        ),
        this.callDays(tenant, args),
        this.modelRows(tenant, args),
        this.intentRows(tenant, args),
        this.db.query(
          `SELECT l.user_id, COUNT(*) requests, SUM(l.status = 'error') errors, MAX(l.created_at) last_request_at,
                  u.first_name, u.last_name, u.email
             FROM ai_request_log l LEFT JOIN \`user\` u ON u.id = l.user_id
            WHERE l.tenant_id = ? AND l.created_at >= ? AND l.created_at < DATE_ADD(?, INTERVAL 1 DAY)
            GROUP BY l.user_id, u.first_name, u.last_name, u.email`,
          args,
        ),
        this.db.query(
          `SELECT l.user_id, SUM(c.input_tokens) input_tokens, SUM(c.output_tokens) output_tokens,
                  SUM(c.cost_usd) cost_usd
             FROM ai_request_calls c JOIN ai_request_log l ON l.id = c.request_log_id
            WHERE c.tenant_id = ? AND c.created_at >= ? AND c.created_at < DATE_ADD(?, INTERVAL 1 DAY)
            GROUP BY l.user_id`,
          args,
        ),
        this.db.query(
          `SELECT l.id, l.created_at, l.user_id, l.intent, l.request_type, l.model, l.total_ms, l.status,
                  u.first_name, u.last_name,
                  COUNT(c.id) calls,
                  COALESCE(SUM(c.input_tokens), 0) input_tokens, COALESCE(SUM(c.output_tokens), 0) output_tokens,
                  SUM(c.cost_usd) cost_usd, SUM(c.id IS NOT NULL AND c.cost_usd IS NULL) unpriced_calls,
                  SUM(c.estimated) estimated_calls
             FROM ai_request_log l
             LEFT JOIN ai_request_calls c ON c.request_log_id = l.id
             LEFT JOIN \`user\` u ON u.id = l.user_id
            WHERE l.tenant_id = ? AND l.created_at >= ? AND l.created_at < DATE_ADD(?, INTERVAL 1 DAY)
            GROUP BY l.id, u.first_name, u.last_name
            ORDER BY l.created_at DESC LIMIT 50`,
          args,
        ),
      ]);
    const tokensByUser = new Map(userCalls.map((row: any) => [row.user_id === null ? null : num(row.user_id), row]));
    const name = (row: any) =>
      [row.first_name, row.last_name].filter(Boolean).join(' ').trim() || row.email || (row.user_id ? `Utilisateur #${row.user_id}` : 'Inconnu');

    return {
      period,
      currency: 'USD',
      cabinet: {
        id: cabinetId,
        name: cabinetId === 0 ? 'Plateforme (hors cabinet)' : info!.name,
        plan_name: info?.plan_name ?? null,
        month_limit: info?.ai_limit ?? null,
      },
      totals: {
        requests: num(requests[0]?.requests),
        errors: num(requests[0]?.errors),
        avg_ms: Math.round(num(requests[0]?.avg_ms)),
        users: num(requests[0]?.users),
        ...calls,
      },
      daily: this.mergeDays(period, requestDays, callDays),
      models: await this.withPrices(models),
      intents,
      users: userRequests
        .map((row: any) => {
          const tokens: any = tokensByUser.get(row.user_id === null ? null : num(row.user_id)) ?? {};
          return {
            user_id: row.user_id === null ? null : num(row.user_id),
            name: name(row),
            requests: num(row.requests),
            errors: num(row.errors),
            last_request_at: row.last_request_at,
            input_tokens: num(tokens.input_tokens),
            output_tokens: num(tokens.output_tokens),
            cost_usd: money(tokens.cost_usd),
          };
        })
        .sort((a: any, b: any) => b.requests - a.requests),
      recent: recent.map((row: any) => ({
        id: num(row.id),
        created_at: row.created_at,
        user: name(row),
        intent: row.intent,
        request_type: row.request_type,
        model: row.model,
        total_ms: row.total_ms === null ? null : num(row.total_ms),
        status: row.status,
        /** 0 : requête sans appel mesuré (réponse directe, ou antérieure au suivi). */
        calls: num(row.calls),
        input_tokens: num(row.input_tokens),
        output_tokens: num(row.output_tokens),
        cost_usd: row.cost_usd === null ? null : money(row.cost_usd),
        unpriced_calls: num(row.unpriced_calls),
        estimated: num(row.estimated_calls) > 0,
      })),
    };
  }

  // ── Tarifs ───────────────────────────────────────────────────────────────

  /**
   * Enregistre le tarif d'un modèle. Il s'applique aux nouveaux appels et aux
   * appels passés qui n'avaient pas encore de tarif ; un coût déjà calculé
   * n'est jamais réécrit.
   */
  async setPrice(body: unknown, adminId?: number) {
    let price;
    try {
      price = validatePriceInput(body);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
    const store = await this.usage.loadPricing();
    const before = findPrice(store, price.provider, price.model);
    await this.writePricing(upsertPrice(store, price), adminId);
    const cachedRate = price.cached_input ?? price.input;
    const result: any = await this.db.query(
      `UPDATE ai_request_calls
          SET cost_usd = ((input_tokens - LEAST(cached_input_tokens, input_tokens)) * ?
                          + LEAST(cached_input_tokens, input_tokens) * ? + output_tokens * ?) / 1000000
        WHERE provider = ? AND model = ? AND cost_usd IS NULL`,
      [price.input, cachedRate, price.output, price.provider, price.model],
    );
    PlatformAuditContext.set({
      action: 'ai.pricing.update',
      targetType: 'platform_ai_pricing',
      targetId: `${price.provider}/${price.model}`,
      summary: `Tarif IA ${price.provider} / ${price.model} : ${price.input} $ entrée, ${price.output} $ sortie (par million de tokens)`,
      before,
      after: price,
    });
    return { pricing: await this.pricingList(), backfilled_calls: num(result?.affectedRows) };
  }

  async removePrice(body: any, adminId?: number) {
    const provider = String(body?.provider ?? '').trim();
    const model = String(body?.model ?? '').trim();
    const store = await this.usage.loadPricing();
    const before = findPrice(store, provider, model);
    if (!before) throw new NotFoundException('Tarif introuvable');
    await this.writePricing(removePrice(store, provider, model), adminId);
    PlatformAuditContext.set({
      action: 'ai.pricing.delete',
      targetType: 'platform_ai_pricing',
      targetId: `${provider}/${model}`,
      summary: `Tarif IA retiré : ${provider} / ${model} (les coûts déjà calculés sont conservés)`,
      before,
      after: null,
    });
    return { pricing: await this.pricingList() };
  }

  /** Modèles tarifés ou déjà appelés, avec leur tarif (null = non renseigné). */
  async pricingList() {
    const [store, seen, labels] = await Promise.all([
      this.usage.loadPricing(),
      this.db.query(
        `SELECT provider, model, COUNT(*) calls, MAX(created_at) last_used_at
           FROM ai_request_calls GROUP BY provider, model`,
      ),
      this.providerLabels(),
    ]);
    const keys = new Map<string, { provider: string; model: string; calls: number; last_used_at: string | null }>();
    for (const row of seen) {
      keys.set(`${row.provider}\u0000${row.model}`, {
        provider: row.provider,
        model: row.model,
        calls: num(row.calls),
        last_used_at: row.last_used_at,
      });
    }
    for (const price of store.prices) {
      const key = `${price.provider}\u0000${price.model}`;
      if (!keys.has(key)) keys.set(key, { provider: price.provider, model: price.model, calls: 0, last_used_at: null });
    }
    return [...keys.values()]
      .map((entry) => ({
        ...entry,
        provider_label: labels.get(entry.provider) ?? entry.provider,
        price: findPrice(store, entry.provider, entry.model),
      }))
      .sort((a, b) => b.calls - a.calls || a.model.localeCompare(b.model));
  }

  // ── Interne ──────────────────────────────────────────────────────────────

  private async callTotals(tenantFilter: string, args: unknown[]): Promise<CallTotals> {
    const rows = await this.db.query(
      `SELECT COUNT(*) calls, SUM(input_tokens) input_tokens, SUM(output_tokens) output_tokens,
              SUM(cached_input_tokens) cached_input_tokens, SUM(cost_usd) cost_usd,
              SUM(cost_usd IS NULL) unpriced_calls, SUM(estimated) estimated_calls
         FROM ai_request_calls WHERE ${tenantFilter} ${RANGE}`,
      args,
    );
    const row = rows[0] ?? {};
    return {
      calls: num(row.calls),
      input_tokens: num(row.input_tokens),
      output_tokens: num(row.output_tokens),
      cached_input_tokens: num(row.cached_input_tokens),
      cost_usd: money(row.cost_usd),
      unpriced_calls: num(row.unpriced_calls),
      estimated_calls: num(row.estimated_calls),
    };
  }

  private callDays(tenantFilter: string, args: unknown[]) {
    return this.db.query(
      `SELECT DATE(created_at) day, SUM(input_tokens) input_tokens, SUM(output_tokens) output_tokens,
              SUM(cost_usd) cost_usd
         FROM ai_request_calls WHERE ${tenantFilter} ${RANGE} GROUP BY DATE(created_at)`,
      args,
    );
  }

  private async modelRows(tenantFilter: string, args: unknown[]) {
    const rows = await this.db.query(
      `SELECT provider, model, COUNT(*) calls, SUM(input_tokens) input_tokens, SUM(output_tokens) output_tokens,
              SUM(cached_input_tokens) cached_input_tokens, SUM(cost_usd) cost_usd,
              SUM(cost_usd IS NULL) unpriced_calls, SUM(estimated) estimated_calls
         FROM ai_request_calls WHERE ${tenantFilter} ${RANGE}
        GROUP BY provider, model ORDER BY SUM(cost_usd) DESC, COUNT(*) DESC`,
      args,
    );
    return rows.map((row: any) => ({
      provider: row.provider,
      model: row.model,
      calls: num(row.calls),
      input_tokens: num(row.input_tokens),
      output_tokens: num(row.output_tokens),
      cached_input_tokens: num(row.cached_input_tokens),
      cost_usd: money(row.cost_usd),
      unpriced_calls: num(row.unpriced_calls),
      estimated_calls: num(row.estimated_calls),
    }));
  }

  private async intentRows(tenantFilter: string, args: unknown[]) {
    const rows = await this.db.query(
      `SELECT COALESCE(intent, request_type, 'AUTRE') intent, COUNT(*) requests
         FROM ai_request_log WHERE ${tenantFilter} ${RANGE}
        GROUP BY COALESCE(intent, request_type, 'AUTRE') ORDER BY COUNT(*) DESC`,
      args,
    );
    return rows.map((row: any) => ({ intent: String(row.intent), requests: num(row.requests) }));
  }

  private mergeDays(period: UsagePeriod, requestDays: any[], callDays: any[]) {
    const calls = new Map(callDays.map((row) => [dayKey(row.day), row]));
    return fillDays(
      period,
      requestDays.map((row) => {
        const day = dayKey(row.day);
        const call: any = calls.get(day) ?? {};
        calls.delete(day);
        return {
          day,
          requests: num(row.requests),
          errors: num(row.errors),
          input_tokens: num(call.input_tokens),
          output_tokens: num(call.output_tokens),
          cost_usd: money(call.cost_usd),
        };
      }).concat(
        // Jours avec des appels hors question (confirmations…) mais sans requête.
        [...calls.entries()].map(([day, call]: [string, any]) => ({
          day,
          requests: 0,
          errors: 0,
          input_tokens: num(call.input_tokens),
          output_tokens: num(call.output_tokens),
          cost_usd: money(call.cost_usd),
        })),
      ),
      (day) => ({ day, requests: 0, errors: 0, input_tokens: 0, output_tokens: 0, cost_usd: 0 }),
    );
  }

  private async withPrices<T extends { provider: string; model: string }>(rows: T[]) {
    const [store, labels] = await Promise.all([this.usage.loadPricing(), this.providerLabels()]);
    return rows.map((row) => ({
      ...row,
      provider_label: labels.get(row.provider) ?? row.provider,
      price: findPrice(store, row.provider, row.model),
    }));
  }

  private async cabinetInfo(ids: number[]) {
    const wanted = ids.filter((id) => id > 0);
    const info = new Map<number, { name: string; plan_name: string | null; ai_limit: number | null }>();
    if (!wanted.length) return info;
    const rows = await this.db.query(
      `SELECT c.id, c.name, p.name plan_name, p.ai_requests_per_month ai_limit
         FROM cabinets c LEFT JOIN plans p ON p.id = c.plan_id
        WHERE c.id IN (${wanted.map(() => '?').join(', ')})`,
      wanted,
    );
    for (const row of rows) {
      const limit = row.ai_limit === null || row.ai_limit === undefined ? null : num(row.ai_limit);
      info.set(num(row.id), { name: row.name, plan_name: row.plan_name ?? null, ai_limit: limit === -1 ? null : limit });
    }
    return info;
  }

  /** Libellés des fournisseurs (intégrés et personnalisés), sans aucune clé. */
  private async providerLabels(): Promise<Map<string, string>> {
    const labels = new Map(this.router.listBuiltinProviders().map((provider) => [provider.id, provider.label]));
    const rows: Array<{ value: unknown }> = await this.db.query(
      'SELECT `value` FROM platform_settings WHERE `key` = ? LIMIT 1',
      [PLATFORM_AI_SETTING_KEY],
    );
    for (const [id, provider] of Object.entries(parseStoredAiConfig(rows?.[0]?.value)?.providers ?? {})) {
      if (provider?.label && !labels.has(id)) labels.set(id, provider.label);
    }
    return labels;
  }

  private async writePricing(store: AiPricingStore, adminId?: number) {
    await this.db.query(
      `INSERT INTO platform_settings (\`key\`, \`value\`, updated_by_admin_id)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE \`value\` = VALUES(\`value\`), updated_by_admin_id = VALUES(updated_by_admin_id), updated_at = CURRENT_TIMESTAMP`,
      [PLATFORM_AI_PRICING_KEY, JSON.stringify(store), adminId ?? null],
    );
    this.usage.invalidatePricing();
  }
}
