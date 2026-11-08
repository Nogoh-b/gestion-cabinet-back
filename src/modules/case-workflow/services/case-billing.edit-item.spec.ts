import { ConflictException } from '@nestjs/common';
import { describe, expect, it, jest } from '@jest/globals';
import { TenantContext } from 'src/core/tenant/tenant.context';
import {
  BillableCategory,
  BillableItemStatus,
  BillableSourceType,
} from '../case-workflow.enums';
import { resourceHintsFor, sanitizeResourceHints } from '../resource-hints';
import { CaseBillingService, isManuallyEdited } from './case-billing.service';

const ITEM_ID = '33333333-3333-4333-8333-333333333333';

function item(overrides: Record<string, unknown> = {}) {
  return {
    id: ITEM_ID,
    tenant_id: 22,
    dossier_id: 74,
    source_type: BillableSourceType.ACTION,
    source_id: 'action-1',
    action_id: 'action-1',
    category: BillableCategory.HONORARIUM,
    label: 'Rédaction des conclusions',
    quantity: 1,
    unit_price: 50000,
    net_amount: 50000,
    tax_rate: 0,
    tax_amount: 0,
    gross_amount: 50000,
    status: BillableItemStatus.TO_INVOICE,
    review_reason: null,
    calculation_snapshot: {},
    lock_version: 3,
    ...overrides,
  };
}

function serviceFor(current: Record<string, any>) {
  const eventAppend = jest.fn(async () => undefined);
  const service = new CaseBillingService(
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    { append: eventAppend } as any,
  );
  const save = jest.fn(async (value: any) => value);
  const queryBuilder: any = {
    setLock: () => queryBuilder,
    where: () => queryBuilder,
    andWhere: () => queryBuilder,
    getOne: async () => current,
  };
  const manager = {
    getRepository: () => ({
      createQueryBuilder: () => queryBuilder,
      save,
      findOne: jest.fn(async () => null),
    }),
  };
  Object.assign(service as object, {
    eventRepository: { findOne: jest.fn(async () => null) },
    itemRepository: { findOne: jest.fn(async () => current) },
    dataSource: { transaction: (work: any) => work(manager) },
  });
  return { service, save, eventAppend };
}

const run = <T>(work: () => Promise<T>) => new TenantContext().run(22, work);

describe('CaseBillingService.editItem — correction manuelle d’une ligne', () => {
  it('recalcule les montants, garde la trace et protège la ligne', async () => {
    const current = item();
    const { service, eventAppend } = serviceFor(current);

    const saved: any = await run(() =>
      service.editItem(
        ITEM_ID,
        {
          label: '  Conclusions récapitulatives ',
          quantity: 2,
          unit_price: 30000,
          tax_rate: 19.25,
          note: 'Deux jeux de conclusions',
          expected_version: 3,
        },
        'edit-key-1',
        9,
      ),
    );

    expect(saved).toMatchObject({
      label: 'Conclusions récapitulatives',
      net_amount: 60000,
      tax_amount: 11550,
      gross_amount: 71550,
      status: BillableItemStatus.TO_INVOICE,
    });
    expect(isManuallyEdited(saved)).toBe(true);
    expect(eventAppend).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: 'BILLABLE_ITEM_EDITED' }),
    );
  });

  it('rend facturable une ligne à revoir dès qu’un prix est donné', async () => {
    const current = item({
      status: BillableItemStatus.NEEDS_REVIEW,
      review_reason: 'Tarif manquant',
      unit_price: 0,
    });
    const { service } = serviceFor(current);

    const saved: any = await run(() =>
      service.editItem(
        ITEM_ID,
        { unit_price: 25000, expected_version: 3 },
        'edit-key-2',
        9,
      ),
    );

    expect(saved.status).toBe(BillableItemStatus.TO_INVOICE);
    expect(saved.review_reason).toBeNull();
  });

  it('refuse une ligne facturée et une version périmée', async () => {
    const invoiced = serviceFor(item({ status: BillableItemStatus.INVOICED }));
    await expect(
      run(() =>
        invoiced.service.editItem(
          ITEM_ID,
          { unit_price: 1, expected_version: 3 },
          'k3',
          9,
        ),
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    const stale = serviceFor(item());
    await expect(
      run(() =>
        stale.service.editItem(
          ITEM_ID,
          { unit_price: 1, expected_version: 2 },
          'k4',
          9,
        ),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(stale.save).not.toHaveBeenCalled();
  });

  it('« Recalculer » laisse intacte une ligne corrigée à la main', async () => {
    const current = item({
      calculation_snapshot: { manualEdit: { unitPrice: 30000 } },
    });
    const { service, save } = serviceFor(current);
    Object.assign(service as object, {
      dataSource: {
        transaction: (work: any) =>
          work({
            getRepository: () => ({ findOne: async () => current, save }),
          }),
      },
    });

    const [result] = (await run(() =>
      service.recalculateItems(
        { billable_item_ids: [ITEM_ID], dry_run: false },
        'recalc',
        9,
      ),
    )) as Array<Record<string, any>>;

    expect(result.changed).toBe(false);
    expect(result.skipped_reason).toMatch(/corrigée à la main/);
    expect(save).not.toHaveBeenCalled();
  });
});

describe('Conseils de fiches en fin d’action', () => {
  it('reprend les défauts du catalogue tant que le cabinet n’a rien défini', () => {
    const hints = resourceHintsFor({
      code: 'WRITE_HEARING_REPORT',
      resource_hints: null,
    });
    expect(hints.map((hint) => `${hint.type}:${hint.effect}`)).toEqual([
      'audience:update',
      'audience:create',
    ]);
    expect(hints[1].when_results).toEqual(['POSTPONED']);
  });

  it('respecte une liste du cabinet, même vide', () => {
    expect(
      resourceHintsFor({ code: 'WRITE_HEARING_REPORT', resource_hints: [] }),
    ).toEqual([]);
    expect(
      resourceHintsFor({
        code: 'X',
        resource_hints: [
          { type: 'document', effect: 'create', message: 'Ajoutez le PV' },
        ],
      }),
    ).toEqual([
      { type: 'document', effect: 'create', message: 'Ajoutez le PV' },
    ]);
  });

  it('écarte les entrées invalides et les doublons', () => {
    expect(
      sanitizeResourceHints([
        { type: 'facture', effect: 'create', message: 'x' },
        { type: 'audience', effect: 'delete', message: 'x' },
        { type: 'audience', effect: 'create', message: '  ' },
        {
          type: 'audience',
          effect: 'create',
          message: 'Créez-la',
          when_results: ['FILED'],
        },
        { type: 'audience', effect: 'create', message: 'Créez-la' },
        { type: 'audience', effect: 'create', message: 'Créez-la' },
      ]),
    ).toEqual([
      {
        type: 'audience',
        effect: 'create',
        message: 'Créez-la',
        when_results: ['FILED'],
      },
    ]);
  });
});
