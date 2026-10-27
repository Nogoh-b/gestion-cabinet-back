import { describe, expect, it, jest } from '@jest/globals';
import { ConflictException } from '@nestjs/common';
import { TenantContext } from 'src/core/tenant/tenant.context';
import {
  StatutFacture,
  TypeFacture,
} from 'src/modules/facture/dto/create-facture.dto';
import { Facture } from 'src/modules/facture/entities/facture.entity';
import { BillableItem, InvoiceLine } from '../entities/billing.entity';
import {
  BillableItemStatus,
  BillableSourceType,
} from '../case-workflow.enums';
import { CaseBillingService } from './case-billing.service';

const TENANT_ID = 22;

function buildHarness(options: {
  facture: Record<string, unknown>;
  items: Record<string, unknown>[];
  existingLines?: Record<string, unknown>[];
  priorEvent?: Record<string, unknown> | null;
}) {
  const facture = { ...options.facture };
  const eventAppend = jest.fn(async () => undefined);
  const eventRepository = {
    findOne: jest.fn(async () => options.priorEvent ?? null),
  };
  const factureRepo = {
    findOne: jest.fn(async () => facture),
    save: jest.fn(async (value: unknown) => value),
  };
  const queryBuilder = {
    setLock: jest.fn(() => queryBuilder),
    where: jest.fn(() => queryBuilder),
    andWhere: jest.fn(() => queryBuilder),
    getMany: jest.fn(async () => options.items),
  };
  const itemRepo = {
    createQueryBuilder: jest.fn(() => queryBuilder),
    save: jest.fn(async (value: unknown) => value),
  };
  let lineSequence = 0;
  const lineRepo = {
    find: jest.fn(async () => options.existingLines ?? []),
    create: jest.fn((value: unknown) => value),
    save: jest.fn(async (value: Record<string, unknown>) => ({
      ...value,
      id: `line-${++lineSequence}`,
    })),
  };
  const manager = {
    getRepository: jest.fn((entity: unknown) => {
      if (entity === Facture) return factureRepo;
      if (entity === BillableItem) return itemRepo;
      if (entity === InvoiceLine) return lineRepo;
      throw new Error(`Dépôt inattendu: ${String(entity)}`);
    }),
  };
  const dataSource = {
    transaction: jest.fn(async (callback: (m: unknown) => Promise<unknown>) =>
      callback(manager),
    ),
  };
  const service = new CaseBillingService(
    dataSource as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    { findOne: factureRepo.findOne } as any,
    eventRepository as any,
    {} as any,
    { append: eventAppend } as any,
  );
  return { service, facture, lineRepo, itemRepo, eventAppend };
}

const baseFacture = {
  id: 'facture-1',
  type: TypeFacture.HONORAIRES,
  status: StatutFacture.BROUILLON,
  dossier_id: 74,
  currency: 'XAF',
  montantHT: 100000,
  montantTVA: 0,
  montantTTC: 100000,
  tauxTVA: 0,
};

function billableItem(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    tenant_id: TENANT_ID,
    dossier_id: 74,
    currency: 'XAF',
    status: BillableItemStatus.TO_INVOICE,
    source_type: BillableSourceType.MANUAL,
    source_id: `source-${id}`,
    source_event_key: `key-${id}`,
    category: 'HONORARIUM',
    calculation_mode: 'FIXED',
    unit_label: null,
    action_id: null,
    billing_rule_id: null,
    label: `Honoraires ${id}`,
    quantity: 1,
    unit_price: 0,
    net_amount: 0,
    tax_rate: 0,
    tax_amount: 0,
    gross_amount: 0,
    occurred_at: new Date('2026-10-01'),
    calculation_snapshot: {},
    invoice_line_id: null,
    ...overrides,
  };
}

describe('CaseBillingService - ajout d’éléments facturables à une facture', () => {
  it('ajoute les lignes à la suite, incrémente les totaux et marque les éléments facturés', async () => {
    const itemA = billableItem('item-a', {
      net_amount: 50000,
      gross_amount: 50000,
      occurred_at: new Date('2026-10-01'),
    });
    const itemB = billableItem('item-b', {
      net_amount: 20000,
      tax_rate: 20,
      tax_amount: 4000,
      gross_amount: 24000,
      occurred_at: new Date('2026-10-05'),
    });
    const { service, facture, lineRepo, eventAppend } = buildHarness({
      facture: baseFacture,
      items: [itemB, itemA],
      existingLines: [{ id: 'line-0', display_order: 1 }],
    });

    const result = await new TenantContext().run(TENANT_ID, () =>
      service.addItemsToFacture(
        'facture-1',
        { billable_item_ids: ['item-a', 'item-b'] },
        'key-1',
        7,
      ),
    );

    expect(facture.montantHT).toBe(170000);
    expect(facture.montantTVA).toBe(4000);
    expect(facture.montantTTC).toBe(174000);
    expect(facture.tauxTVA).toBe(2.35);

    const orders = lineRepo.save.mock.calls.map(
      ([value]) => value.display_order,
    );
    expect(orders).toEqual([2, 3]);
    expect(itemA.status).toBe(BillableItemStatus.INVOICED);
    expect(itemA.invoice_line_id).toBe('line-1');
    expect(itemB.status).toBe(BillableItemStatus.INVOICED);
    expect(itemB.invoice_line_id).toBe('line-2');

    expect(eventAppend).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventType: 'INVOICE_ITEMS_ADDED',
        idempotencyKey: 'INVOICE_ITEMS:key-1',
      }),
    );
    expect(result).toBe(facture);
  });

  it('refuse une facture qui n’est plus en brouillon', async () => {
    const { service, lineRepo } = buildHarness({
      facture: { ...baseFacture, status: StatutFacture.ENVOYEE },
      items: [billableItem('item-a')],
    });

    await expect(
      new TenantContext().run(TENANT_ID, () =>
        service.addItemsToFacture(
          'facture-1',
          { billable_item_ids: ['item-a'] },
          'key-2',
          7,
        ),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(lineRepo.save).not.toHaveBeenCalled();
  });

  it('refuse un élément déjà facturé, sans rien écrire', async () => {
    const { service, lineRepo, facture } = buildHarness({
      facture: baseFacture,
      items: [
        billableItem('item-a', {
          status: BillableItemStatus.INVOICED,
          invoice_line_id: 'line-9',
        }),
      ],
    });

    await expect(
      new TenantContext().run(TENANT_ID, () =>
        service.addItemsToFacture(
          'facture-1',
          { billable_item_ids: ['item-a'] },
          'key-3',
          7,
        ),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(lineRepo.save).not.toHaveBeenCalled();
    expect(facture.montantHT).toBe(100000);
  });

  it('refuse un élément appartenant à un autre dossier', async () => {
    const { service, lineRepo } = buildHarness({
      facture: baseFacture,
      items: [billableItem('item-a', { dossier_id: 99 })],
    });

    await expect(
      new TenantContext().run(TENANT_ID, () =>
        service.addItemsToFacture(
          'facture-1',
          { billable_item_ids: ['item-a'] },
          'key-4',
          7,
        ),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(lineRepo.save).not.toHaveBeenCalled();
  });

  it('rejoue sans doublon quand la même Idempotency-Key revient', async () => {
    const { service, lineRepo, itemRepo } = buildHarness({
      facture: baseFacture,
      items: [billableItem('item-a')],
      priorEvent: { idempotency_key: 'INVOICE_ITEMS:key-5' },
    });

    await new TenantContext().run(TENANT_ID, () =>
      service.addItemsToFacture(
        'facture-1',
        { billable_item_ids: ['item-a'] },
        'key-5',
        7,
      ),
    );

    expect(lineRepo.save).not.toHaveBeenCalled();
    expect(itemRepo.save).not.toHaveBeenCalled();
  });
});
