import { describe, expect, it, jest } from '@jest/globals';
import { TenantContext } from 'src/core/tenant/tenant.context';
import { DossierAction } from 'src/modules/case-workflow/entities/dossier-action.entity';
import {
  ActionBillingDecision,
  BillableItemStatus,
  BillableSourceType,
} from '../case-workflow.enums';
import { CaseBillingService } from './case-billing.service';

function setup(options: {
  profile?: unknown;
  factures?: Array<{ dateEcheance: Date }>;
  items?: unknown[];
  actions?: Record<string, any>;
  recalculated?: unknown[];
}) {
  const savedActions: unknown[] = [];
  const appendedEvents: unknown[] = [];
  const actionRepository = {
    findOne: jest.fn(async ({ where }: any) => options.actions?.[where.id] ?? null),
    save: jest.fn(async (value: unknown) => {
      savedActions.push(value);
      return value;
    }),
  };
  const manager = {
    getRepository: jest.fn((entity: unknown) => {
      if (entity === DossierAction) return actionRepository;
      throw new Error('unexpected repository');
    }),
  };
  const service = new CaseBillingService(
    { transaction: jest.fn(async (work: any) => work(manager)) } as any,
    { findOne: jest.fn(async () => options.profile ?? null) } as any,
    {} as any,
    { find: jest.fn(async () => options.items ?? []) } as any,
    {} as any,
    {} as any,
    {} as any,
    { find: jest.fn(async () => options.factures ?? []) } as any,
    {} as any,
    {} as any,
    { append: jest.fn(async (_m: unknown, event: unknown) => { appendedEvents.push(event); }) } as any,
  );
  const recalculateSpy = jest
    .spyOn(service, 'recalculateItems')
    .mockResolvedValue(
      (options.recalculated ?? []) as Array<Record<string, unknown>>,
    );
  return { service, recalculateSpy, savedActions, appendedEvents, actionRepository };
}

const openItem = (patch: Record<string, unknown> = {}) => ({
  id: 'item-1',
  tenant_id: 22,
  dossier_id: 12,
  source_type: BillableSourceType.ACTION,
  action_id: 'act-1',
  source_id: 'act-1',
  status: BillableItemStatus.TO_INVOICE,
  ...patch,
});

describe('CaseBillingService - bascule forfait/horaire', () => {
  it('bascule en horaire et recalcul les éléments ouverts', async () => {
    const action = { id: 'act-1', billing_decision: ActionBillingDecision.BILLABLE };
    const { service, recalculateSpy, savedActions, appendedEvents } = setup({
      profile: { hourly_rate: 25000, fixed_fee: 100000 },
      factures: [
        { dateEcheance: new Date('2026-05-31') },
        { dateEcheance: new Date('2026-07-15') },
      ],
      items: [openItem()],
      actions: { 'act-1': action },
      recalculated: [{ billable_item_id: 'item-1', changed: true }],
    });
    const result = await new TenantContext().run(22, () =>
      service.switchBillingMode(
        { dossier_id: 12, target_mode: 'HOURLY' } as any,
        'key-1',
        9,
      ),
    );
    expect(action.billing_decision).toBe(ActionBillingDecision.HOURLY);
    expect(savedActions).toHaveLength(1);
    expect(result.deadline).toBe('2026-07-15');
    expect(recalculateSpy).toHaveBeenCalledWith(
      { billable_item_ids: ['item-1'], dry_run: false },
      'key-1',
      9,
    );
    expect(appendedEvents).toHaveLength(1);
    expect(result.recalculated).toHaveLength(1);
  });

  it('bascule en forfait et conserve le délai renseigné', async () => {
    const action = { id: 'act-1', billing_decision: ActionBillingDecision.HOURLY };
    const { service } = setup({
      profile: { hourly_rate: 25000, fixed_fee: 100000 },
      factures: [{ dateEcheance: new Date('2026-07-15') }],
      items: [openItem()],
      actions: { 'act-1': action },
    });
    const result = await new TenantContext().run(22, () =>
      service.switchBillingMode(
        { dossier_id: 12, target_mode: 'FIXED', deadline: '2026-08-31' } as any,
        'key-2',
        9,
      ),
    );
    expect(action.billing_decision).toBe(ActionBillingDecision.BILLABLE);
    expect(result.deadline).toBe('2026-08-31');
  });

  it('exige le taux du mode cible', async () => {
    const { service } = setup({
      profile: { hourly_rate: null, fixed_fee: 100000 },
      items: [openItem()],
    });
    await expect(
      new TenantContext().run(22, () =>
        service.switchBillingMode(
          { dossier_id: 12, target_mode: 'HOURLY' } as any,
          'key-3',
          9,
        ),
      ),
    ).rejects.toThrow('taux horaire');
  });

  it('ignore les actions hors forfait/horaire et exige des éléments ouverts', async () => {
    const { service } = setup({
      profile: { hourly_rate: 25000, fixed_fee: 100000 },
      items: [
        openItem({ id: 'item-vac', action_id: 'act-vac', source_id: 'act-vac' }),
      ],
      actions: {
        'act-vac': { id: 'act-vac', billing_decision: ActionBillingDecision.VACATION },
      },
    });
    const result = await new TenantContext().run(22, () =>
      service.switchBillingMode(
        { dossier_id: 12, target_mode: 'HOURLY' } as any,
        'key-4',
        9,
      ),
    );
    expect(result.recalculated).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    const empty = setup({ profile: { hourly_rate: 1 }, items: [] });
    await expect(
      new TenantContext().run(22, () =>
        empty.service.switchBillingMode(
          { dossier_id: 12, target_mode: 'HOURLY' } as any,
          'key-5',
          9,
        ),
      ),
    ).rejects.toThrow('Aucun élément ouvert');
  });
});
