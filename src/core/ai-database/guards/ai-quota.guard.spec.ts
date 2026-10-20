/**
 * AiQuotaGuard — module IA du plan (`ai_enabled`) puis quota mensuel.
 * Un refus ne doit jamais créer de ligne `ai_request_log`.
 */
import { describe, expect, it, jest } from '@jest/globals';
import { ForbiddenException } from '@nestjs/common';

import { PlanQuotaService } from 'src/modules/plans/plan-quota.service';
import { AiQuotaGuard } from './ai-quota.guard';

function setup(activePlan: any, used = 0, user: any = { tenantId: 25, userId: 7 }) {
  const cabinetRepo: any = { findOne: jest.fn(async () => ({ id: 25, activePlan })) };
  const logRepo: any = {
    count: jest.fn(async () => used),
    create: jest.fn((row: any) => row),
    save: jest.fn(async (row: any) => ({ ...row, id: 99 })),
  };
  const guard = new AiQuotaGuard(logRepo, new PlanQuotaService(cabinetRepo));
  const req: any = { user };
  const ctx: any = { switchToHttp: () => ({ getRequest: () => req }) };
  return { guard, ctx, req, logRepo };
}

describe('AiQuotaGuard', () => {
  it('refuse un plan sans module IA, sans compter ni journaliser', async () => {
    const { guard, ctx, req, logRepo } = setup({ name: 'Free', ai_enabled: 0, ai_requests_per_month: 50 });

    const attempt = guard.canActivate(ctx);
    await expect(attempt).rejects.toBeInstanceOf(ForbiddenException);
    await expect(attempt).rejects.toThrow(
      'Le module "l\'assistant IA" n\'est pas inclus dans votre plan "Free". Veuillez mettre à niveau votre abonnement.',
    );
    expect(logRepo.count).not.toHaveBeenCalled();
    expect(logRepo.save).not.toHaveBeenCalled();
    expect(req.aiRequestLogId).toBeUndefined();
  });

  it('laisse passer un cabinet sans plan et journalise la requête', async () => {
    const { guard, ctx, req, logRepo } = setup(null);

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(logRepo.count).not.toHaveBeenCalled();
    expect(logRepo.save).toHaveBeenCalledWith({ tenant_id: 25, user_id: 7 });
    expect(req.aiRequestLogId).toBe(99);
  });

  it('laisse passer un plan avec IA sous le quota', async () => {
    const { guard, ctx, req, logRepo } = setup({ name: 'Pro', ai_enabled: 1, ai_requests_per_month: 50 }, 49);

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(logRepo.save).toHaveBeenCalledTimes(1);
    expect(req.aiRequestLogId).toBe(99);
  });

  it('refuse un plan avec IA dont le quota est atteint, sans journaliser', async () => {
    const { guard, ctx, logRepo } = setup({ name: 'Pro', ai_enabled: 1, ai_requests_per_month: 50 }, 50);

    await expect(guard.canActivate(ctx)).rejects.toThrow('Quota de requêtes IA atteint (50/50 ce mois)');
    expect(logRepo.save).not.toHaveBeenCalled();
  });

  it('ne restreint pas une requête sans tenant', async () => {
    const { guard, ctx, logRepo } = setup({ name: 'Free', ai_enabled: 0 }, 0, null);

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(logRepo.save).not.toHaveBeenCalled();
  });
});
