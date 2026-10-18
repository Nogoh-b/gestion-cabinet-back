import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { AsyncLocalStorage } from 'async_hooks';
import { DataSource } from 'typeorm';
import { getExplicitTenantId } from '../tenant/tenant.context';
import { AiModelRouterService } from './ai-model-router.service';
import {
  AiPricingStore,
  AiUsageEvent,
  costUsd,
  findPrice,
  parsePricingStore,
  PLATFORM_AI_PRICING_KEY,
} from './ai-usage';

/**
 * Journal de consommation des modèles (`ai_request_calls`) : une ligne par
 * appel, avec les tokens et le coût au tarif du moment.
 *
 * Les appels faits pendant une question du chat sont rattachés à sa ligne
 * `ai_request_log` (enregistrés à la fin de la requête) ; les autres
 * (confirmation d'écriture, assistant de la plateforme…) sont enregistrés
 * aussitôt, au cabinet courant ou à la plateforme (tenant 0).
 */
@Injectable()
export class AiUsageService {
  private readonly logger = new Logger(AiUsageService.name);
  private readonly collector = new AsyncLocalStorage<AiUsageEvent[]>();
  private pricing: { store: AiPricingStore; expiresAt: number } | null = null;

  constructor(
    router: AiModelRouterService,
    @InjectDataSource() private readonly db: DataSource,
  ) {
    router.onUsage((event) => this.capture(event));
  }

  /** Les appels de modèle faits pendant `fn` sont ajoutés à `events`. */
  collect<T>(events: AiUsageEvent[], fn: () => Promise<T>): Promise<T> {
    return this.collector.run(events, fn);
  }

  async record(
    events: AiUsageEvent[],
    context: { tenantId: number; requestLogId?: number | null },
  ): Promise<void> {
    if (!events.length) return;
    const pricing = await this.loadPricing();
    const rows = events.map((event) => {
      const price = findPrice(pricing, event.provider, event.model);
      return [
        context.requestLogId ?? null,
        context.tenantId,
        event.provider.slice(0, 64),
        event.model.slice(0, 128),
        event.profile.slice(0, 16),
        event.inputTokens,
        event.outputTokens,
        event.cachedInputTokens,
        event.reasoningTokens,
        event.estimated ? 1 : 0,
        price ? costUsd(event, price) : null,
      ];
    });
    await this.db.query(
      `INSERT INTO ai_request_calls
         (request_log_id, tenant_id, provider, model, profile, input_tokens, output_tokens,
          cached_input_tokens, reasoning_tokens, estimated, cost_usd)
       VALUES ${rows.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ')}`,
      rows.flat(),
    );
  }

  /** À appeler après une modification des tarifs. */
  invalidatePricing(): void {
    this.pricing = null;
  }

  async loadPricing(): Promise<AiPricingStore> {
    if (this.pricing && this.pricing.expiresAt > Date.now()) return this.pricing.store;
    const rows: Array<{ value: unknown }> = await this.db.query(
      'SELECT `value` FROM platform_settings WHERE `key` = ? LIMIT 1',
      [PLATFORM_AI_PRICING_KEY],
    );
    const store = parsePricingStore(rows?.[0]?.value);
    this.pricing = { store, expiresAt: Date.now() + 60_000 };
    return store;
  }

  private capture(event: AiUsageEvent): void {
    const bucket = this.collector.getStore();
    if (bucket) {
      bucket.push(event);
      return;
    }
    void this.record([event], { tenantId: getExplicitTenantId() ?? 0 }).catch((error) =>
      this.logger.warn(`Consommation IA non enregistrée : ${(error as Error).message}`),
    );
  }
}
