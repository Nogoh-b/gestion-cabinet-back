import { BadRequestException, ConflictException } from '@nestjs/common';
import { describe, expect, it, jest } from '@jest/globals';
import { TenantContext } from 'src/core/tenant/tenant.context';
import { ComptabilisationService } from 'src/modules/comptabilite/services/comptabilisation.service';
import { EntityManager } from 'typeorm';
import {
  BillableItem,
  DossierBillingProfile,
  DossierBillingRule,
} from '../entities/billing.entity';
import { DossierAction } from '../entities/dossier-action.entity';
import { ActionDefinition } from '../entities/action-catalog.entity';
import {
  ActionBillingDecision,
  BillableCategory,
  BillableItemStatus,
  BillableSourceType,
  BillingCalculationMode,
  BillingMode,
} from '../case-workflow.enums';
import { CaseBillingService } from './case-billing.service';

function createService(eventAppend = jest.fn()) {
  return new CaseBillingService(
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
}

describe('CaseBillingService - saisie manuelle avec catégorie (phase 5)', () => {
  function serviceWithRepositories() {
    const service = createService();
    const save = jest.fn(async (value: any) => ({ id: 'manual-1', ...value }));
    Object.assign(service as object, {
      dossierRepository: {
        findOne: jest.fn(async () => ({ id: 74, client_id: 67 })),
      },
      profileRepository: {
        findOne: jest.fn(async () => ({
          tenant_id: 22,
          dossier_id: 74,
          currency: 'XAF',
          vat_rate: 0,
        })),
      },
      itemRepository: {
        findOne: jest.fn(async () => null),
        create: jest.fn((value: any) => value),
        save,
        manager: {},
      },
    });
    return { service, save };
  }

  const baseDto = {
    label: 'Consultation exceptionnelle',
    quantity: 1,
    unit_price: 75000,
  };

  it('crée un élément avec la catégorie honoraires', async () => {
    const { service, save } = serviceWithRepositories();

    const item: any = await new TenantContext().run(22, () =>
      service.createManualItem(
        74,
        { ...baseDto, category: BillableCategory.HONORARIUM } as any,
        'manual-key-1',
        9,
      ),
    );

    expect(save).toHaveBeenCalledTimes(1);
    expect(item.category).toBe(BillableCategory.HONORARIUM);
    expect(item.net_amount).toBe(75000);
  });

  it('refuse une saisie manuelle sans catégorie', async () => {
    const { service } = serviceWithRepositories();

    await expect(
      new TenantContext().run(22, () =>
        service.createManualItem(74, baseDto as any, 'manual-key-2', 9),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it.each([BillableCategory.EXPENSE, BillableCategory.DISBURSEMENT])(
    'refuse un faux frais manuel de catégorie %s',
    async (category) => {
      const { service, save } = serviceWithRepositories();

      await expect(
        new TenantContext().run(22, () =>
          service.createManualItem(
            74,
            { ...baseDto, category } as any,
            `manual-key-${category}`,
            9,
          ),
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(save).not.toHaveBeenCalled();
    },
  );
});

describe('CaseBillingService - recalcul contrôlé (phase 5)', () => {
  function chainable(result: unknown) {
    const chain: any = {};
    for (const method of [
      'where',
      'andWhere',
      'orderBy',
      'addOrderBy',
    ]) {
      chain[method] = jest.fn(() => chain);
    }
    chain.getOne = jest.fn(async () => result);
    return chain;
  }

  function serviceWithManager(options: {
    item: any;
    action?: any;
    profile?: any;
    definition?: any;
    rule?: any;
  }) {
    const eventAppend = jest.fn(async () => undefined);
    const service = createService(eventAppend);
    const save = jest.fn(async (value: any) => value);
    const repositories = new Map<unknown, any>([
      [
        BillableItem,
        {
          findOne: jest.fn(async () => options.item),
          save,
        },
      ],
      [
        DossierAction,
        { findOne: jest.fn(async () => options.action ?? null) },
      ],
      [
        DossierBillingProfile,
        { findOne: jest.fn(async () => options.profile ?? null) },
      ],
      [
        ActionDefinition,
        { findOne: jest.fn(async () => options.definition ?? null) },
      ],
      [
        DossierBillingRule,
        { createQueryBuilder: jest.fn(() => chainable(options.rule ?? null)) },
      ],
    ]);
    const manager = {
      getRepository: jest.fn((entity: unknown) => {
        const repository = repositories.get(entity);
        if (!repository) throw new Error(`Dépôt inattendu: ${String(entity)}`);
        return repository;
      }),
    } as unknown as EntityManager;
    Object.assign(service as object, {
      dataSource: { transaction: jest.fn(async (work: any) => work(manager)) },
    });
    return { service, save, eventAppend };
  }

  const hourlyAction = {
    id: 'action-1',
    tenant_id: 22,
    dossier_id: 74,
    definition_id: 'definition-1',
    definition_code: 'CONSULTATION',
    definition_version: 1,
    billing_decision: ActionBillingDecision.HOURLY,
    billing_reason: null,
    duration_minutes: 90,
    specific_data: null,
  };

  const hourlyProfile = {
    tenant_id: 22,
    dossier_id: 74,
    mode: BillingMode.HOURLY,
    hourly_rate: 20000,
    vat_rate: 0,
    currency: 'XAF',
  };

  function hourlyItem(overrides: Record<string, unknown> = {}) {
    return {
      id: '11111111-1111-4111-8111-111111111111',
      tenant_id: 22,
      dossier_id: 74,
      source_type: BillableSourceType.ACTION,
      source_id: 'action-1',
      action_id: 'action-1',
      category: BillableCategory.HONORARIUM,
      calculation_mode: BillingCalculationMode.HOURLY,
      quantity: 1.5,
      unit_price: 10000,
      net_amount: 15000,
      tax_rate: 0,
      tax_amount: 0,
      gross_amount: 15000,
      status: BillableItemStatus.TO_INVOICE,
      calculation_snapshot: {},
      ...overrides,
    };
  }

  it('détecte en aperçu un changement de tarif horaire', async () => {
    const { service, save } = serviceWithManager({
      item: hourlyItem(),
      action: hourlyAction,
      profile: hourlyProfile,
    });

    const [result] = (await new TenantContext().run(22, () =>
      service.recalculateItems(
        {
          billable_item_ids: ['11111111-1111-4111-8111-111111111111'],
          dry_run: true,
        },
        'recalc-key-1',
        9,
      ),
    )) as Array<Record<string, any>>;

    expect(result.changed).toBe(true);
    expect(result.after).toMatchObject({ unit_price: 20000, net_amount: 30000 });
    expect(save).not.toHaveBeenCalled();
  });

  it('applique le recalcul et journalise l’événement', async () => {
    const { service, save, eventAppend } = serviceWithManager({
      item: hourlyItem(),
      action: hourlyAction,
      profile: hourlyProfile,
    });

    const [result] = (await new TenantContext().run(22, () =>
      service.recalculateItems(
        {
          billable_item_ids: ['11111111-1111-4111-8111-111111111111'],
          dry_run: false,
        },
        'recalc-key-2',
        9,
      ),
    )) as Array<Record<string, any>>;

    expect(result.changed).toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
    expect(eventAppend).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: 'BILLABLE_ITEM_RECALCULATED' }),
    );
  });

  it('ne touche jamais un élément facturé ou réservé', async () => {
    for (const status of [
      BillableItemStatus.INVOICED,
      BillableItemStatus.RESERVED,
    ]) {
      const { service, save } = serviceWithManager({
        item: hourlyItem({ status }),
        action: hourlyAction,
        profile: hourlyProfile,
      });

      const [result] = (await new TenantContext().run(22, () =>
        service.recalculateItems(
          {
            billable_item_ids: ['11111111-1111-4111-8111-111111111111'],
            dry_run: false,
          },
          `recalc-key-${status}`,
          9,
        ),
      )) as Array<Record<string, any>>;

      expect(result.changed).toBe(false);
      expect(result.skipped_reason).toMatch(/réservé|facturé|clôturé/);
      expect(save).not.toHaveBeenCalled();
    }
  });

  it('ignore les sources non recalculables et exige une sélection', async () => {
    const { service } = serviceWithManager({
      item: hourlyItem({
        id: '22222222-2222-4222-8222-222222222222',
        source_type: BillableSourceType.MANUAL,
      }),
      action: hourlyAction,
      profile: hourlyProfile,
    });

    const [result] = (await new TenantContext().run(22, () =>
      service.recalculateItems(
        {
          billable_item_ids: ['22222222-2222-4222-8222-222222222222'],
          dry_run: true,
        },
        'recalc-key-3',
        9,
      ),
    )) as Array<Record<string, any>>;
    expect(result.changed).toBe(false);
    expect(result.skipped_reason).toMatch(/non recalculable/);

    await expect(
      new TenantContext().run(22, () =>
        service.recalculateItems({ billable_item_ids: [] }, 'recalc-key-4', 9),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('ComptabilisationService - ventilation par catégorie (phase 5)', () => {
  function serviceWithInvoice(options: {
    lines: Array<{ category: string | null; net_amount: number }>;
    mapping?: Record<string, string> | null;
    ht?: number;
  }) {
    const created: any[] = [];
    const service = new ComptabilisationService(
      {
        existeParSource: jest.fn(async () => false),
        creer: jest.fn(async (dto: any) => {
          created.push(dto);
          return { id: 'ecriture-1', ...dto };
        }),
      } as any,
      { find: jest.fn(async () => options.lines) } as any,
      {
        findOne: jest.fn(async () => ({
          id: 22,
          billing_account_mapping: options.mapping ?? null,
        })),
      } as any,
    );
    const warn = jest.fn();
    Object.assign((service as any).logger, { warn });
    const facture = {
      id: 'facture-1',
      tenant_id: 22,
      numero: 'FAC-2026-0001',
      montantHT: options.ht ?? 150,
      montantTVA: 28.5,
      dateFacture: '2026-09-01',
    };
    return { service, created, warn, facture };
  }

  it('ventile le HT par catégorie avec équilibre débit-crédit', async () => {
    const { service, created, warn, facture } = serviceWithInvoice({
      lines: [
        { category: 'HONORARIUM', net_amount: 100 },
        { category: 'DISBURSEMENT', net_amount: 50 },
      ],
      mapping: { DISBURSEMENT: '471' },
    });

    await service.comptabiliserFacture(facture);

    const lignes = created[0].lignes;
    const byAccount = new Map(
      lignes.map((line: any) => [line.numeroCompte, line]),
    );
    expect(byAccount.get('411')).toMatchObject({ debit: 178.5, credit: 0 });
    expect(byAccount.get('706')).toMatchObject({ debit: 0, credit: 100 });
    expect(byAccount.get('471')).toMatchObject({ debit: 0, credit: 50 });
    expect(byAccount.get('445')).toMatchObject({ debit: 0, credit: 28.5 });
    const debit = lignes.reduce((sum: number, line: any) => sum + line.debit, 0);
    const credit = lignes.reduce(
      (sum: number, line: any) => sum + line.credit,
      0,
    );
    expect(debit).toBeCloseTo(credit, 2);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('HONORARIUM'));
  });

  it('replie sur une seule ligne 706 sans lignes détaillées', async () => {
    const { service, created, warn, facture } = serviceWithInvoice({
      lines: [],
    });

    await service.comptabiliserFacture(facture);

    const lignes = created[0].lignes;
    expect(
      lignes.filter((line: any) => line.numeroCompte === '706'),
    ).toHaveLength(1);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('sans lignes détaillées'),
    );
  });
});
