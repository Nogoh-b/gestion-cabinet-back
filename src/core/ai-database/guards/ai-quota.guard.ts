import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';

import { PlanQuotaService } from 'src/modules/plans/plan-quota.service';
import { AiRequestLog } from '../entities/ai-request-log.entity';

/**
 * AiQuotaGuard — applique le quota mensuel `ai_requests_per_month` du plan sur
 * les routes IA (ask / ask-stream).
 *
 * Isolé du cœur du module ai-database (en cours de refonte) : ne dépend que de
 * son propre journal `AiRequestLog` et de PlanQuotaService. Compte les
 * tentatives du mois courant, refuse si la limite est atteinte, sinon
 * enregistre la requête.
 */
@Injectable()
export class AiQuotaGuard implements CanActivate {
  constructor(
    @InjectRepository(AiRequestLog)
    private readonly repo: Repository<AiRequestLog>,
    private readonly planQuota: PlanQuotaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const tenantId: number | undefined =
      req.user?.tenantId ?? req.resolvedTenantId;
    if (!tenantId) return true; // pas de tenant → pas de quota

    const plan = await this.planQuota.getCabinetPlan(tenantId);
    const limit = plan?.ai_requests_per_month;

    // null / -1 = illimité (ou aucun plan) → aucune limite appliquée.
    if (limit !== null && limit !== undefined && limit !== -1) {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const used = await this.repo.count({
        where: { tenant_id: tenantId, created_at: MoreThanOrEqual(monthStart) },
      });
      if (used >= limit) {
        throw new ForbiddenException(
          `Quota de requêtes IA atteint (${used}/${limit} ce mois). ` +
          `Veuillez mettre à niveau votre plan${plan?.name ? ` "${plan.name}"` : ''}.`,
        );
      }
    }

    // Enregistre la requête (comptée comme une tentative).
    const log = await this.repo.save(
      this.repo.create({ tenant_id: tenantId, user_id: req.user?.userId ?? null }),
    );
    req.aiRequestLogId = log.id;
    return true;
  }
}
