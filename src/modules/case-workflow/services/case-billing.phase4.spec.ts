import { ConflictException } from '@nestjs/common';
import { describe, expect, it, jest } from '@jest/globals';
import { TenantContext } from 'src/core/tenant/tenant.context';
import { Dossier } from 'src/modules/dossiers/entities/dossier.entity';
import { EntityManager } from 'typeorm';
import {
  BillableItem,
  DossierBillingProfile,
} from '../entities/billing.entity';
import {
  BillableCategory,
  BillableItemStatus,
  BillableSourceType,
  BillingCalculationMode,
  BillingMode,
  WorkflowEngine,
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

function managerFor(profile: unknown, itemRepository: unknown) {
  return {
    getRepository: jest.fn((entity: unknown) => {
      if (entity === DossierBillingProfile) {
        return { findOne: jest.fn(async () => profile) };
      }
      if (entity === BillableItem) return itemRepository;
      throw new Error(`Dépôt inattendu: ${String(entity)}`);
    }),
  } as unknown as EntityManager;
}

describe('CaseBillingService - forfait principal (phase 4)', () => {
  it('crée un élément HONORARIUM à facturer quand le forfait est configuré', async () => {
    const eventAppend = jest.fn(async () => undefined);
    const service = createService(eventAppend);
    const itemRepository = {
      findOne: jest.fn(async () => null),
      create: jest.fn((value: any) => value),
      save: jest.fn(async (value: any) => ({ id: 'fixed-1', ...value })),
    };
    const manager = managerFor(
      {
        tenant_id: 22,
        dossier_id: 74,
        mode: BillingMode.FIXED,
        fixed_fee: 500000,
        vat_rate: 0,
        currency: 'XAF',
      },
      itemRepository,
    );
    const dossier = { id: 74, client_id: 67 } as Dossier;

    const item = await new TenantContext().run(22, () =>
      service.createFixedFeeItem(manager, dossier, 9),
    );

    expect(item).toMatchObject({
      dossier_id: 74,
      source_type: BillableSourceType.MILESTONE,
      category: BillableCategory.HONORARIUM,
      calculation_mode: BillingCalculationMode.FIXED,
      source_event_key: 'DOSSIER:74:FIXED_FEE',
      quantity: 1,
      unit_price: 500000,
      net_amount: 500000,
      status: BillableItemStatus.TO_INVOICE,
    });
    expect(eventAppend).toHaveBeenCalledTimes(1);
  });

  it('ne crée aucun forfait pour un dossier horaire', async () => {
    const service = createService();
    const manager = managerFor(
      { tenant_id: 22, dossier_id: 74, mode: BillingMode.HOURLY },
      { findOne: jest.fn(async () => null) },
    );

    const item = await new TenantContext().run(22, () =>
      service.createFixedFeeItem(manager, { id: 74 } as Dossier, 9),
    );

    expect(item).toBeNull();
  });

  it('crée un élément bloqué quand le forfait manque, sans inventer de montant', async () => {
    const service = createService();
    const itemRepository = {
      findOne: jest.fn(async () => null),
      create: jest.fn((value: any) => value),
      save: jest.fn(async (value: any) => ({ id: 'fixed-2', ...value })),
    };
    const manager = managerFor(
      {
        tenant_id: 22,
        dossier_id: 74,
        mode: BillingMode.FIXED,
        fixed_fee: null,
        vat_rate: 0,
        currency: 'XAF',
      },
      itemRepository,
    );

    const item = await new TenantContext().run(22, () =>
      service.createFixedFeeItem(manager, { id: 74, client_id: 67 } as Dossier, 9),
    );

    expect(item).toMatchObject({
      net_amount: 0,
      status: BillableItemStatus.NEEDS_REVIEW,
      review_reason: 'Montant du forfait manquant',
    });
  });

  it('réutilise le forfait existant au lieu de le dupliquer', async () => {
    const service = createService();
    const existing = { id: 'fixed-9', source_event_key: 'DOSSIER:74:FIXED_FEE' };
    const save = jest.fn(async (value: any) => value);
    const manager = managerFor(
      { tenant_id: 22, dossier_id: 74, mode: BillingMode.FIXED, fixed_fee: 1 },
      { findOne: jest.fn(async () => existing), save },
    );

    const item = await new TenantContext().run(22, () =>
      service.createFixedFeeItem(manager, { id: 74 } as Dossier, 9),
    );

    expect(item).toBe(existing);
    expect(save).not.toHaveBeenCalled();
  });
});

describe('CaseBillingService - honoraire de résultat (phase 4)', () => {
  function serviceWithProfile(profile: any, existingItem: any = null) {
    const eventAppend = jest.fn(async () => undefined);
    const service = createService(eventAppend);
    const save = jest.fn(async (value: any) => ({
      id: existingItem?.id ?? 'result-1',
      ...(typeof value === 'object' ? value : {}),
    }));
    Object.assign(service as object, {
      dossierRepository: {
        findOne: jest.fn(async () => ({
          id: 74,
          client_id: 67,
          workflow_engine: WorkflowEngine.ACTIONS_V2,
        })),
      },
      profileRepository: {
        findOne: jest.fn(async () => profile),
      },
      itemRepository: {
        findOne: jest.fn(async () => existingItem),
        create: jest.fn((value: any) => value),
        save,
        manager: {},
      },
    });
    return { service, save, eventAppend };
  }

  const baseProfile = {
    tenant_id: 22,
    dossier_id: 74,
    mode: BillingMode.FIXED,
    fixed_fee: 100000,
    hourly_rate: null,
    default_vacation_rate: null,
    result_fee_enabled: true,
    result_fee_rate: 10,
    vat_rate: 0,
    currency: 'XAF',
  };

  const dto = {
    base_amount: 2000000,
    result_reference: 'Jugement RG 25/00123',
    occurred_at: '2026-09-15',
    note: 'Intéressement validé',
  };

  it('calcule 10 % de 2 000 000 et trace base, taux, acteur et référence', async () => {
    const { service, eventAppend } = serviceWithProfile(baseProfile);

    const item = await new TenantContext().run(22, () =>
      service.validateResultFee(74, dto as any, 'key-1', 9),
    );

    expect(item).toMatchObject({
      dossier_id: 74,
      source_type: BillableSourceType.RESULT,
      category: BillableCategory.RESULT_FEE,
      calculation_mode: BillingCalculationMode.PERCENTAGE,
      source_event_key: 'DOSSIER:74:RESULT_FEE',
      unit_price: 2000000,
      net_amount: 200000,
      gross_amount: 200000,
      status: BillableItemStatus.TO_INVOICE,
    });
    expect(item.calculation_snapshot).toMatchObject({
      baseAmount: 2000000,
      rate: 10,
      resultReference: 'Jugement RG 25/00123',
      actorUserId: 9,
    });
    expect(eventAppend).toHaveBeenCalledTimes(1);
  });

  it('refuse quand l’honoraire de résultat n’est pas configuré', async () => {
    const { service } = serviceWithProfile({
      ...baseProfile,
      result_fee_enabled: false,
      result_fee_rate: null,
    });

    await expect(
      new TenantContext().run(22, () =>
        service.validateResultFee(74, dto as any, 'key-2', 9),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuse quand il serait la seule rémunération professionnelle', async () => {
    const { service } = serviceWithProfile({
      ...baseProfile,
      fixed_fee: null,
      hourly_rate: null,
      default_vacation_rate: null,
    });

    await expect(
      new TenantContext().run(22, () =>
        service.validateResultFee(74, dto as any, 'key-3', 9),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('met à jour l’élément ouvert lors d’une nouvelle validation', async () => {
    const existingItem = {
      id: 'result-1',
      source_event_key: 'DOSSIER:74:RESULT_FEE',
      status: BillableItemStatus.TO_INVOICE,
      occurred_at: new Date('2026-01-01'),
    };
    const { service, save } = serviceWithProfile(baseProfile, existingItem);

    const item: any = await new TenantContext().run(22, () =>
      service.validateResultFee(
        74,
        { ...dto, base_amount: 3000000 } as any,
        'key-4',
        9,
      ),
    );

    expect(save).toHaveBeenCalledTimes(1);
    expect(item.net_amount).toBe(300000);
    expect(item.status).toBe(BillableItemStatus.TO_INVOICE);
  });

  it('refuse toute modification après facturation', async () => {
    const { service } = serviceWithProfile(baseProfile, {
      id: 'result-1',
      source_event_key: 'DOSSIER:74:RESULT_FEE',
      status: BillableItemStatus.INVOICED,
    });

    await expect(
      new TenantContext().run(22, () =>
        service.validateResultFee(74, dto as any, 'key-5', 9),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
