import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { PlanQuotaService } from 'src/modules/plans/plan-quota.service';
import { AiCreditsService } from 'src/modules/plans/ai-credits/ai-credits.service';
import { AI_CREDITS_EXHAUSTED } from 'src/modules/plans/ai-credits/ai-credits';
import { AiRequestLog } from '../entities/ai-request-log.entity';

/**
 * AiQuotaGuard — applique le module IA (`ai_enabled`) et le budget de crédits
 * mensuel (`ai_credits_per_month` + crédits achetés) sur les routes qui
 * appellent le modèle (ask, ask/stream, form/prepare, analyze).
 *
 * Isolé du cœur du module ai-database (en cours de refonte) : ne dépend que de
 * son propre journal `AiRequestLog`, de PlanQuotaService et d'AiCreditsService.
 * Refuse si le plan n'inclut pas l'IA, puis (403 `AI_CREDITS_EXHAUSTED`) si le
 * forfait du mois et les crédits achetés sont épuisés, sinon enregistre la
 * requête. Aucun plan → aucune restriction. Une requête déjà en cours peut
 * dépasser légèrement : la consommation n'est connue qu'à la fin de l'appel.
 */
@Injectable()
export class AiQuotaGuard implements CanActivate {
  constructor(
    @InjectRepository(AiRequestLog)
    private readonly repo: Repository<AiRequestLog>,
    private readonly planQuota: PlanQuotaService,
    private readonly credits: AiCreditsService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const tenantId: number | undefined =
      req.user?.tenantId ?? req.resolvedTenantId;
    if (!tenantId) return true; // pas de tenant → pas de quota

    const plan = await this.planQuota.getCabinetPlan(tenantId);
    // Module IA absent du plan : refus avant tout comptage ou journal.
    this.planQuota.assertModuleEnabled(plan, 'ai');

    // Forfait du mois + crédits achetés épuisés → l'IA est bloquée.
    if (await this.credits.isExhausted(tenantId, plan)) {
      throw new ForbiddenException({
        statusCode: 403,
        code: AI_CREDITS_EXHAUSTED,
        message: 'Crédits IA épuisés — achetez un pack dans Abonnement.',
        error: 'Forbidden',
      });
    }

    // Enregistre la requête (comptée comme une tentative).
    const log = await this.repo.save(
      this.repo.create({
        tenant_id: tenantId,
        user_id: req.user?.userId ?? null,
      }),
    );
    req.aiRequestLogId = log.id;
    return true;
  }
}
