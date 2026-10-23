/**
 * Achat d'un pack de crédits IA : un paiement `kind = 'ai_credits'` qui
 * réutilise les passerelles mais crédite seulement le ledger du cabinet.
 *  - confirmPayment est idempotent (clé unique `payment_id`) ;
 *  - l'abonnement et le cabinet ne sont jamais modifiés ;
 *  - la recherche de « l'échéance due » ignore les achats de crédits.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { AiCreditsService } from '../plans/ai-credits/ai-credits.service';
import { PlanQuotaService } from '../plans/plan-quota.service';
import { SubscriptionsService } from './subscriptions.service';

function fakeRepo<T extends { id: number }>(rows: T[]) {
  const matches = (row: any, where: any) =>
    Object.entries(where ?? {}).every(([k, v]: [string, any]) => {
      if (v && typeof v === 'object' && '_type' in v && v._type === 'in') return v._value.includes(row[k]);
      return row[k] === v;
    });
  return {
    rows,
    findOne: jest.fn(async (opts: any) => {
      const found = rows.filter((r) => matches(r, opts?.where));
      if (opts?.order) found.sort((a: any, b: any) => b.id - a.id);
      return found[0] ?? null;
    }),
    save: jest.fn(async (entity: any) => {
      const i = rows.findIndex((r) => r.id === entity.id);
      if (i >= 0) rows[i] = { ...rows[i], ...entity };
      return entity;
    }),
    update: jest.fn(async () => ({ affected: 0 })),
  };
}

/** Ledger en mémoire avec la clé unique `payment_id`. */
function fakeLedgerDb() {
  const ledger: Array<{ tenant_id: number; kind: string; credits: number; payment_id: number | null }> = [];
  const db: any = {
    ledger,
    query: jest.fn(async (sql: string, params: any[] = []) => {
      if (sql.includes("INSERT IGNORE INTO ai_credit_ledger") && sql.includes("'purchase'")) {
        const [tenant_id, credits, payment_id] = params;
        if (ledger.some((r) => r.payment_id === payment_id)) return { affectedRows: 0 };
        ledger.push({ tenant_id, kind: 'purchase', credits, payment_id });
        return { affectedRows: 1 };
      }
      if (sql.includes("INSERT INTO ai_credit_ledger") && sql.includes("'refund'")) {
        ledger.push({ tenant_id: params[0], kind: 'refund', credits: params[1], payment_id: null });
        return { affectedRows: 1 };
      }
      return [];
    }),
  };
  return db;
}

function build() {
  const cabinet: any = { id: 5, status: 'suspended', suspension_reason: 'payment_required', plan_id: 2 };
  const sub: any = {
    id: 50,
    cabinet_id: 5,
    plan_id: 2,
    status: 'pending_payment',
    is_trial: false,
    ends_at: new Date(Date.now() + 30 * 86400000),
    created_at: new Date(),
    billing_cycle: 'monthly',
    amount: 9900,
    currency: 'XAF',
  };
  const subscriptionPayment: any = {
    id: 400,
    subscription_id: 50,
    cabinet_id: 5,
    kind: 'subscription',
    status: 'pending',
    amount: 9900,
    currency: 'XAF',
  };
  const creditsPayment: any = {
    id: 500,
    subscription_id: 50,
    cabinet_id: 5,
    kind: 'ai_credits',
    ai_credit_pack_id: 3,
    ai_credits: 2500,
    status: 'pending',
    amount: 5000,
    currency: 'XAF',
    method: null,
    provider: null,
  };
  const cabinetRepo = fakeRepo([cabinet]);
  const subRepo = fakeRepo([sub]);
  const payRepo = fakeRepo([subscriptionPayment, creditsPayment]);
  const events: any = { record: jest.fn(async () => undefined) };
  const ledgerDb = fakeLedgerDb();
  const aiCredits = new AiCreditsService(ledgerDb, {} as any, new PlanQuotaService({} as any));
  const service = new SubscriptionsService(
    subRepo as any,
    payRepo as any,
    cabinetRepo as any,
    fakeRepo([]) as any,
    { providerName: 'test', isTest: true } as any,
    {} as any,
    { assignNumber: jest.fn(async () => 'REC-2026-000001') } as any,
    {} as any,
    events,
    {} as any,
    aiCredits,
  );
  return { service, cabinetRepo, subRepo, payRepo, events, ledgerDb, cabinet, sub, creditsPayment };
}

describe('SubscriptionsService — achat de crédits IA', () => {
  let ctx: ReturnType<typeof build>;
  beforeEach(() => {
    ctx = build();
  });

  it('confirmPayment crédite le ledger sans toucher à l’abonnement ni au cabinet', async () => {
    const result = await ctx.service.confirmPayment(ctx.creditsPayment);

    expect(result).toBeNull();
    expect(ctx.creditsPayment.status).toBe('paid');
    expect(ctx.ledgerDb.ledger).toEqual([{ tenant_id: 5, kind: 'purchase', credits: 2500, payment_id: 500 }]);
    // Abonnement toujours en attente de SON paiement, cabinet toujours bloqué.
    expect(ctx.subRepo.save).not.toHaveBeenCalled();
    expect(ctx.cabinetRepo.save).not.toHaveBeenCalled();
    expect(ctx.sub.status).toBe('pending_payment');
    expect(ctx.cabinet.status).toBe('suspended');
  });

  it('confirmPayment est idempotent : un second appel ne crédite rien', async () => {
    await ctx.service.confirmPayment(ctx.creditsPayment);
    await ctx.service.confirmPayment(ctx.creditsPayment);
    await ctx.service.confirmPayment({ ...ctx.creditsPayment });

    expect(ctx.ledgerDb.ledger).toHaveLength(1);
    // L'événement « paiement encaissé » n'est émis qu'au premier passage.
    expect(ctx.events.record).toHaveBeenCalledTimes(1);
  });

  it('un paiement déjà encaissé mais jamais crédité (plantage) est crédité une fois', async () => {
    ctx.creditsPayment.status = 'paid';
    await ctx.service.confirmPayment(ctx.creditsPayment);
    await ctx.service.confirmPayment(ctx.creditsPayment);

    expect(ctx.ledgerDb.ledger).toHaveLength(1);
    expect(ctx.events.record).not.toHaveBeenCalled();
  });

  it('confirmer l’échéance d’abonnement active toujours l’abonnement', async () => {
    const due = ctx.payRepo.rows.find((p: any) => p.kind === 'subscription');
    await ctx.service.confirmPayment(due as any);

    expect(ctx.sub.status).toBe('active');
    expect(ctx.ledgerDb.ledger).toHaveLength(0);
  });

  it('simulatePayment sans identifiant ignore les achats de crédits', async () => {
    process.env.PAYMENT_TEST_MODE = 'true';
    const spy = jest.spyOn(ctx.service, 'confirmPayment');
    await ctx.service.simulatePayment(5).catch(() => undefined);

    expect(spy).toHaveBeenCalledTimes(1);
    expect((spy.mock.calls[0][0] as any).kind).toBe('subscription');
    expect(ctx.ledgerDb.ledger).toHaveLength(0);
  });

  it('un remboursement partiel retire des crédits au prorata', async () => {
    ctx.creditsPayment.status = 'paid';
    await ctx.service.confirmPayment(ctx.creditsPayment);
    await ctx.service.refundPaymentByPlatform(500, { type: 'platform_admin', id: 1, label: 'owner@test' }, {
      amount: 2500,
      reason: 'Geste commercial',
    });

    expect(ctx.ledgerDb.ledger.at(-1)).toMatchObject({ kind: 'refund', credits: -1250 });
  });
});
