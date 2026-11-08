/**
 * « Offrir l'illimité » : plan choisi, ends_at = null, sans échéance due, et
 * retour à une période payante à l'annulation.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { SubscriptionsService } from './subscriptions.service';

const DAY = 86400000;

function fakeRepo(rows: any[]) {
  const matches = (row: any, where: any) =>
    Object.entries(where ?? {}).every(([k, v]: [string, any]) =>
      v && typeof v === 'object' && v._type === 'in' ? v._value.includes(row[k]) : row[k] === v,
    );
  return {
    rows,
    findOne: jest.fn(async (opts: any) => rows.filter((r) => matches(r, opts?.where))[0] ?? null),
    count: jest.fn(async (opts: any) => rows.filter((r) => matches(r, opts?.where)).length),
    create: jest.fn((data: any) => ({ ...data })),
    save: jest.fn(async (entity: any) => {
      entity.id ??= 900;
      if (!rows.includes(entity)) rows.push(entity);
      return entity;
    }),
    update: jest.fn(async (where: any, patch: any) => {
      rows.filter((r) => matches(r, where)).forEach((r) => Object.assign(r, patch));
      return { affected: 1 };
    }),
  };
}

function build(subOverrides: Record<string, any> = {}, payOverrides: Record<string, any> = {}) {
  const cabinet: any = {
    id: 5,
    status: 'suspended',
    suspension_reason: 'payment_required',
    suspended_at: new Date(),
    plan_id: 1,
    trial_ends_at: null,
  };
  const sub: any = {
    id: 50,
    cabinet_id: 5,
    plan_id: 1,
    status: 'pending_payment',
    is_trial: false,
    trial_ends_at: null,
    ends_at: new Date(Date.now() + 30 * DAY),
    billing_cycle: 'monthly',
    amount: 9900,
    currency: 'XAF',
    auto_renew: true,
    ...subOverrides,
  };
  const payment: any = {
    id: 500,
    subscription_id: 50,
    cabinet_id: 5,
    kind: 'subscription',
    status: 'pending',
    amount: 9900,
    ...payOverrides,
  };
  const plan = { id: 2, name: 'Pro', price_monthly: 25000, price_yearly: 250000 };
  const eventRows: any[] = [];
  const events: any = {
    record: jest.fn(async (input: any) => {
      eventRows.push({ ...input, subscription_id: input.subscriptionId });
    }),
    findLast: jest.fn(async () => eventRows[eventRows.length - 1] ?? null),
  };
  const subRepo = fakeRepo([sub]);
  const payRepo = fakeRepo([payment]);
  const cabinetRepo = fakeRepo([cabinet]);
  const service = new SubscriptionsService(
    subRepo as any,
    payRepo as any,
    cabinetRepo as any,
    fakeRepo([plan]) as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    events,
    {} as any,
    {} as any,
  );
  return { service, sub, payment, cabinet, subRepo, events };
}

const actor = { type: 'platform_admin' as const, id: 1, label: 'owner@test' };

describe('SubscriptionsService — illimité offert', () => {
  let ctx: ReturnType<typeof build>;
  beforeEach(() => {
    ctx = build();
  });

  it('sort un cabinet de pending_payment : plan choisi, sans date de fin, échéance annulée', async () => {
    const saved = await ctx.service.grantUnlimitedByPlatform(5, { planId: 2, note: 'Partenaire' }, actor);
    expect(saved).toMatchObject({ plan_id: 2, status: 'active', ends_at: null, is_trial: false, amount: 0 });
    expect(saved.auto_renew).toBe(false);
    expect(ctx.payment.status).toBe('cancelled');
    expect(ctx.cabinet).toMatchObject({ status: 'active', suspension_reason: null, plan_id: 2 });
    expect(ctx.events.record).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'unlimited_granted',
        cabinetId: 5,
        payload: expect.objectContaining({ plan_id: 2, note: 'Partenaire' }),
      }),
    );
  });

  it('quitte un essai sans garder sa date', async () => {
    ctx = build({ status: 'trial', is_trial: true, trial_ends_at: new Date(Date.now() + DAY) });
    const saved = await ctx.service.grantUnlimitedByPlatform(5, { planId: 2 }, actor);
    expect(saved).toMatchObject({ is_trial: false, trial_ends_at: null, ends_at: null });
  });

  it('crée un abonnement quand le cabinet n’en a plus', async () => {
    ctx.subRepo.rows.length = 0;
    const saved = await ctx.service.grantUnlimitedByPlatform(5, { planId: 2 }, actor);
    expect(saved).toMatchObject({ cabinet_id: 5, plan_id: 2, status: 'active', ends_at: null, currency: 'XAF' });
  });

  it('refuse tant qu’un paiement déclaré attend validation', async () => {
    ctx = build({}, { status: 'awaiting_validation' });
    await expect(ctx.service.grantUnlimitedByPlatform(5, { planId: 2 }, actor)).rejects.toThrow(/attend validation/);
    expect(ctx.sub.ends_at).not.toBeNull();
  });

  it('laisse en place une suspension manuelle', async () => {
    ctx.cabinet.suspension_reason = 'manual';
    await ctx.service.grantUnlimitedByPlatform(5, { planId: 2 }, actor);
    expect(ctx.cabinet).toMatchObject({ status: 'suspended', suspension_reason: 'manual' });
  });

  it('ne fait jamais expirer un abonnement sans date de fin', async () => {
    await ctx.service.grantUnlimitedByPlatform(5, { planId: 2 }, actor);
    const current = await ctx.service.getCurrent(5);
    expect(current).toMatchObject({ days_remaining: null, is_expired: false, is_expiring: false });
    expect(ctx.sub.status).toBe('active');
  });

  it('refuse prolongation, mois offerts et résiliation différée', async () => {
    await ctx.service.grantUnlimitedByPlatform(5, { planId: 2 }, actor);
    await expect(ctx.service.extendByPlatform(5, { days: 10 }, actor)).rejects.toThrow(/illimité/);
    await expect(ctx.service.grantFreePeriodByPlatform(5, 1, actor)).rejects.toThrow(/illimité/);
    await expect(
      ctx.service.cancelByPlatform(5, { reason: 'Test', immediate: false }, actor),
    ).rejects.toThrow(/illimité/);
  });

  it('protège l’offre du libre-service du cabinet', async () => {
    await ctx.service.grantUnlimitedByPlatform(5, { planId: 2 }, actor);
    await expect(
      ctx.service.changePlanOrCycle(5, { cycle: 'yearly' }, { type: 'cabinet_user', id: 7 }),
    ).rejects.toThrow(/support/);
    await expect(
      ctx.service.renewForCabinet(5, undefined, { type: 'cabinet_user', id: 7 }),
    ).rejects.toThrow(/support/);
  });

  it('un changement de plan sans facturation reste offert', async () => {
    await ctx.service.grantUnlimitedByPlatform(5, { planId: 2 }, actor);
    ctx.sub.plan_id = 1;
    const saved = await ctx.service.changePlanByPlatform(5, { planId: 2, mode: 'keep_period' }, actor);
    expect(saved).toMatchObject({ plan_id: 2, amount: 0, ends_at: null });
  });

  it('le retrait rétablit l’ancienne échéance et le tarif du plan', async () => {
    const previous = ctx.sub.ends_at;
    await ctx.service.grantUnlimitedByPlatform(5, { planId: 2 }, actor);
    const saved = await ctx.service.revokeUnlimitedByPlatform(5, {}, actor);
    expect(saved.ends_at).toEqual(previous);
    expect(saved).toMatchObject({ amount: 25000, auto_renew: true });
    expect(ctx.events.record).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'unlimited_revoked' }));
  });

  it('le retrait accorde un cycle quand l’ancienne échéance est passée', async () => {
    ctx = build({ ends_at: new Date(Date.now() - DAY) });
    await ctx.service.grantUnlimitedByPlatform(5, { planId: 2 }, actor);
    const saved = await ctx.service.revokeUnlimitedByPlatform(5, {}, actor);
    expect(new Date(saved.ends_at!).getTime()).toBeGreaterThan(Date.now() + 25 * DAY);
  });

  it('refuse de retirer un abonnement qui n’est pas un illimité offert', async () => {
    ctx = build({ ends_at: null, status: 'active' });
    await expect(ctx.service.revokeUnlimitedByPlatform(5, {}, actor)).rejects.toThrow(/pas un illimité offert/);
  });
});
