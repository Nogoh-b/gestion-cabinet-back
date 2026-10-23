/**
 * AiQuotaGuard — module IA du plan (`ai_enabled`) puis crédits IA du mois
 * (forfait + crédits achetés). Un refus ne doit jamais créer de ligne
 * `ai_request_log`.
 */
import { describe, expect, it, jest } from '@jest/globals';
import { ForbiddenException } from '@nestjs/common';

import { AiCreditsService } from 'src/modules/plans/ai-credits/ai-credits.service';
import { PlanQuotaService } from 'src/modules/plans/plan-quota.service';
import { AiQuotaGuard } from './ai-quota.guard';

const USD_PER_CREDIT = 0.001;

/**
 * `usedCredits` : crédits consommés ce mois ; `balance` : somme du ledger
 * (crédits achetés ou attribués, dépassements des mois clos déduits).
 */
function setup(
  activePlan: any,
  usedCredits = 0,
  user: any = { tenantId: 25, userId: 7 },
  balance = 0,
) {
  const cabinetRepo: any = { findOne: jest.fn(async () => ({ id: 25, activePlan })) };
  const logRepo: any = {
    create: jest.fn((row: any) => row),
    save: jest.fn(async (row: any) => ({ ...row, id: 99 })),
  };
  const db: any = {
    query: jest.fn(async (sql: string) => {
      if (sql.includes('platform_settings')) return [{ value: JSON.stringify({ usd_per_credit: USD_PER_CREDIT }) }];
      if (sql.includes('ai_request_calls')) return [{ cost: usedCredits * USD_PER_CREDIT }];
      if (sql.includes('ai_credit_ledger')) return [{ balance, granted: Math.max(0, balance) }];
      return [];
    }),
  };
  const planQuota = new PlanQuotaService(cabinetRepo);
  const credits = new AiCreditsService(db, {} as any, planQuota);
  const guard = new AiQuotaGuard(logRepo, planQuota, credits);
  const req: any = { user };
  const ctx: any = { switchToHttp: () => ({ getRequest: () => req }) };
  return { guard, ctx, req, logRepo, db };
}

describe('AiQuotaGuard', () => {
  it('refuse un plan sans module IA, sans calculer ni journaliser', async () => {
    const { guard, ctx, req, logRepo, db } = setup({ name: 'Free', ai_enabled: 0, ai_credits_per_month: 50 });

    const attempt = guard.canActivate(ctx);
    await expect(attempt).rejects.toBeInstanceOf(ForbiddenException);
    await expect(attempt).rejects.toThrow(
      'Le module "l\'assistant IA" n\'est pas inclus dans votre plan "Free". Veuillez mettre à niveau votre abonnement.',
    );
    expect(db.query).not.toHaveBeenCalled();
    expect(logRepo.save).not.toHaveBeenCalled();
    expect(req.aiRequestLogId).toBeUndefined();
  });

  it('laisse passer un cabinet sans plan et journalise la requête', async () => {
    const { guard, ctx, req, logRepo } = setup(null);

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(logRepo.save).toHaveBeenCalledWith({ tenant_id: 25, user_id: 7 });
    expect(req.aiRequestLogId).toBe(99);
  });

  it('forfait illimité (NULL ou -1) : aucune limite, aucun calcul', async () => {
    for (const credits of [null, -1]) {
      const { guard, ctx, logRepo, db } = setup({ name: 'Pro', ai_enabled: 1, ai_credits_per_month: credits }, 9_999_999);
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      expect(db.query).not.toHaveBeenCalled();
      expect(logRepo.save).toHaveBeenCalledTimes(1);
    }
  });

  it('laisse passer un plan avec IA sous le forfait', async () => {
    const { guard, ctx, req, logRepo } = setup({ name: 'Pro', ai_enabled: 1, ai_credits_per_month: 1000 }, 999);

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(logRepo.save).toHaveBeenCalledTimes(1);
    expect(req.aiRequestLogId).toBe(99);
  });

  it('forfait épuisé : 403 AI_CREDITS_EXHAUSTED sans journaliser', async () => {
    const { guard, ctx, logRepo } = setup({ name: 'Pro', ai_enabled: 1, ai_credits_per_month: 1000 }, 1000);

    const attempt = guard.canActivate(ctx);
    await expect(attempt).rejects.toBeInstanceOf(ForbiddenException);
    await expect(attempt).rejects.toMatchObject({
      response: { code: 'AI_CREDITS_EXHAUSTED', message: 'Crédits IA épuisés — achetez un pack dans Abonnement.' },
    });
    expect(logRepo.save).not.toHaveBeenCalled();
  });

  it('forfait dépassé mais crédits achetés restants : la requête passe', async () => {
    // 1 200 consommés sur 1 000 : 200 puisés dans 500 achetés → il en reste 300.
    const { guard, ctx } = setup({ name: 'Pro', ai_enabled: 1, ai_credits_per_month: 1000 }, 1200, undefined, 500);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('forfait et crédits achetés épuisés : bloqué', async () => {
    const { guard, ctx } = setup({ name: 'Pro', ai_enabled: 1, ai_credits_per_month: 1000 }, 1500, undefined, 500);
    await expect(guard.canActivate(ctx)).rejects.toMatchObject({ response: { code: 'AI_CREDITS_EXHAUSTED' } });
  });

  it('ne restreint pas une requête sans tenant', async () => {
    const { guard, ctx, logRepo } = setup({ name: 'Free', ai_enabled: 0 }, 0, null);

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(logRepo.save).not.toHaveBeenCalled();
  });
});
