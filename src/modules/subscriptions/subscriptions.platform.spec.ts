/**
 * Règles plateforme de SubscriptionsService :
 *  - une suspension MANUELLE n'est jamais levée par la synchronisation
 *    automatique (paiement confirmé, prolongation…) ;
 *  - la réactivation plateforme réaligne le cabinet sur son abonnement.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { SubscriptionsService } from './subscriptions.service';

function fakeRepo<T extends { id: number }>(rows: T[]) {
  const matches = (row: any, where: any) =>
    Object.entries(where ?? {}).every(([k, v]: [string, any]) => {
      if (v && typeof v === 'object' && '_type' in v && v._type === 'in') {
        return v._value.includes(row[k]);
      }
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

function build() {
  const cabinet: any = {
    id: 5,
    status: 'active',
    suspension_reason: null,
    suspended_at: null,
    suspended_by_admin_id: null,
    suspension_note: null,
    plan_id: 2,
    trial_ends_at: null,
  };
  const sub: any = {
    id: 50,
    cabinet_id: 5,
    plan_id: 2,
    status: 'pending_payment',
    is_trial: false,
    trial_ends_at: null,
    ends_at: new Date(Date.now() + 30 * 86400000),
    created_at: new Date(),
    billing_cycle: 'monthly',
    amount: 9900,
    currency: 'XAF',
  };
  const payment: any = {
    id: 500,
    subscription_id: 50,
    cabinet_id: 5,
    status: 'pending',
    amount: 9900,
    currency: 'XAF',
    method: null,
  };
  const cabinetRepo = fakeRepo([cabinet]);
  const subRepo = fakeRepo([sub]);
  const payRepo = fakeRepo([payment]);
  const events: any = { record: jest.fn(async () => undefined) };
  const gateway: any = { providerName: 'test', isTest: true };
  const service = new SubscriptionsService(
    subRepo as any,
    payRepo as any,
    cabinetRepo as any,
    fakeRepo([]) as any,
    gateway,
    {} as any,
    { assignNumber: jest.fn(async () => 'REC-2026-000001') } as any,
    {} as any,
    events,
    {} as any,
    {} as any,
  );
  return { service, cabinetRepo, subRepo, payRepo, events };
}

const actor = { type: 'platform_admin' as const, id: 1, label: 'owner@test' };

describe('SubscriptionsService — suspension manuelle', () => {
  let ctx: ReturnType<typeof build>;
  beforeEach(() => {
    ctx = build();
  });

  it('suspendByPlatform pose une suspension manuelle avec auteur et motif', async () => {
    await ctx.service.suspendByPlatform(5, actor, 'Fraude suspectée');
    const cab = ctx.cabinetRepo.rows[0] as any;
    expect(cab.status).toBe('suspended');
    expect(cab.suspension_reason).toBe('manual');
    expect(cab.suspended_by_admin_id).toBe(1);
    expect(cab.suspension_note).toBe('Fraude suspectée');
    expect(ctx.events.record).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'suspended', cabinetId: 5 }),
    );
  });

  it("un paiement confirmé ne lève PAS une suspension manuelle", async () => {
    await ctx.service.suspendByPlatform(5, actor, 'Litige');
    await ctx.service.confirmPayment(ctx.payRepo.rows[0] as any);
    const cab = ctx.cabinetRepo.rows[0] as any;
    expect((ctx.subRepo.rows[0] as any).status).toBe('active');
    expect(cab.status).toBe('suspended');
    expect(cab.suspension_reason).toBe('manual');
  });

  it("sans suspension manuelle, le paiement réactive le cabinet", async () => {
    const cab = ctx.cabinetRepo.rows[0] as any;
    cab.status = 'suspended';
    cab.suspension_reason = 'payment_required';
    await ctx.service.confirmPayment(ctx.payRepo.rows[0] as any);
    expect(cab.status).toBe('active');
    expect(cab.suspension_reason).toBeNull();
  });

  it('la réactivation laisse le cabinet suspendu si un paiement reste dû', async () => {
    await ctx.service.suspendByPlatform(5, actor, 'Contrôle');
    const res = await ctx.service.reactivateByPlatform(5, actor);
    expect(res.still_suspended_reason).toBe('payment_required');
    const cab = ctx.cabinetRepo.rows[0] as any;
    expect(cab.status).toBe('suspended');
    expect(cab.suspension_reason).toBe('payment_required');
  });

  it('la prolongation est refusée tant qu’un paiement est en attente', async () => {
    await expect(
      ctx.service.extendByPlatform(5, { days: 10 }, actor),
    ).rejects.toThrow(/Paiement en attente/);
  });
});
