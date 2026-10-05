import { describe, expect, it, jest } from '@jest/globals';
import { TenantContext } from 'src/core/tenant/tenant.context';
import { Cabinet } from 'src/modules/cabinet/entities/cabinet.entity';
import { Dossier } from 'src/modules/dossiers/entities/dossier.entity';
import { Facture } from 'src/modules/facture/entities/facture.entity';
import { EntityManager } from 'typeorm';
import {
  BillableItem,
  DossierBillingProfile,
} from '../entities/billing.entity';
import { DossierAction } from '../entities/dossier-action.entity';
import {
  ActionBillingDecision,
  BillableCategory,
  BillableItemStatus,
  BillingCalculationMode,
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

describe('CaseBillingService - frais d’ouverture du dossier', () => {
  it('utilise procedure_costs au lieu du tarif cabinet lors de la création de l’élément facturable', async () => {
    const eventAppend = jest.fn(async () => undefined);
    const service = createService(eventAppend);
    const savedItems: any[] = [];
    const itemRepository = {
      findOne: jest.fn(async () => null),
      create: jest.fn((value: any) => value),
      save: jest.fn(async (value: any) => {
        const saved = { id: 'item-1', ...value };
        savedItems.push(saved);
        return saved;
      }),
    };
    const manager = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === Cabinet) {
          return {
            findOne: jest.fn(async () => ({
              id: 22,
              dossier_opening_fee_enabled: true,
              dossier_opening_fee: 5000,
              dossier_opening_fee_tva: 0,
              currency: 'XAF',
            })),
          };
        }
        if (entity === DossierBillingProfile) {
          return { findOne: jest.fn(async () => null) };
        }
        if (entity === BillableItem) return itemRepository;
        if (entity === Facture) {
          return { findOne: jest.fn(async () => null) };
        }
        throw new Error(`Dépôt inattendu: ${String(entity)}`);
      }),
    } as unknown as EntityManager;
    const dossier = {
      id: 74,
      client_id: 67,
      procedure_costs: 25000,
    } as Dossier;

    const item = await new TenantContext().run(22, () =>
      service.createOpeningItem(manager, dossier, 9),
    );

    expect(item).toMatchObject({
      dossier_id: 74,
      unit_price: 25000,
      net_amount: 25000,
      gross_amount: 25000,
    });
    expect(savedItems[0].calculation_snapshot.configuredAmount).toBe(25000);
    expect(eventAppend).toHaveBeenCalledTimes(1);
  });

  it('ne crée pas de frais d’ouverture quand ils sont désactivés dans le profil', async () => {
    const eventAppend = jest.fn(async () => undefined);
    const service = createService(eventAppend);
    const getRepository = jest.fn((entity: unknown) => {
      if (entity === Cabinet) {
        return {
          findOne: jest.fn(async () => ({
            id: 22,
            dossier_opening_fee_enabled: true,
            dossier_opening_fee: 5000,
          })),
        };
      }
      if (entity === DossierBillingProfile) {
        return {
          findOne: jest.fn(async () => ({
            tenant_id: 22,
            dossier_id: 74,
            opening_fee: 25000,
            opening_fee_enabled: false,
            opening_fee_included_in_fixed_fee: false,
          })),
        };
      }
      throw new Error(`Dépôt inattendu: ${String(entity)}`);
    });
    const manager = { getRepository } as unknown as EntityManager;
    const dossier = {
      id: 74,
      client_id: 67,
      procedure_costs: 25000,
    } as Dossier;

    const item = await new TenantContext().run(22, () =>
      service.createOpeningItem(manager, dossier, 9),
    );

    expect(item).toBeNull();
    expect(getRepository).toHaveBeenCalledTimes(2);
    expect(eventAppend).not.toHaveBeenCalled();
  });

  it('ne crée pas de ligne séparée quand les frais d’ouverture sont inclus dans le forfait', async () => {
    const eventAppend = jest.fn(async () => undefined);
    const service = createService(eventAppend);
    const getRepository = jest.fn((entity: unknown) => {
      if (entity === Cabinet) {
        return { findOne: jest.fn(async () => ({ id: 22 })) };
      }
      if (entity === DossierBillingProfile) {
        return {
          findOne: jest.fn(async () => ({
            tenant_id: 22,
            dossier_id: 74,
            mode: 'FIXED',
            fixed_fee: 150000,
            opening_fee: 25000,
            opening_fee_enabled: true,
            opening_fee_included_in_fixed_fee: true,
          })),
        };
      }
      throw new Error(`Dépôt inattendu: ${String(entity)}`);
    });
    const manager = { getRepository } as unknown as EntityManager;
    const dossier = {
      id: 74,
      client_id: 67,
      procedure_costs: 25000,
    } as Dossier;

    const item = await new TenantContext().run(22, () =>
      service.createOpeningItem(manager, dossier, 9),
    );

    expect(item).toBeNull();
    expect(getRepository).toHaveBeenCalledTimes(2);
    expect(eventAppend).not.toHaveBeenCalled();
  });
});

describe('CaseBillingService - rémunération d’une action', () => {
  it('ne crée aucun supplément pour une action incluse dans le forfait', async () => {
    const eventAppend = jest.fn(async () => undefined);
    const service = createService(eventAppend);
    const manager = {
      getRepository: jest.fn(() => {
        throw new Error('Aucun dépôt ne doit être consulté');
      }),
    } as unknown as EntityManager;
    const action = {
      id: 'action-1',
      billing_decision: ActionBillingDecision.INCLUDED_IN_PACKAGE,
    } as DossierAction;

    const item = await service.createForCompletedAction(manager, action, 9);

    expect(item).toBeNull();
    expect(manager.getRepository).not.toHaveBeenCalled();
    expect(eventAppend).not.toHaveBeenCalled();
  });

  it('crée une vacation unique avec le tarif par défaut du dossier', async () => {
    const eventAppend = jest.fn(async () => undefined);
    const service = createService(eventAppend);
    jest.spyOn(service as any, 'applicableRule').mockResolvedValue(null);
    const itemRepository = {
      findOne: jest.fn(async () => null),
      create: jest.fn((value: any) => value),
      save: jest.fn(async (value: any) => ({ id: 'item-vacation', ...value })),
    };
    const manager = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === BillableItem) return itemRepository;
        if (entity === Dossier) {
          return {
            findOne: jest.fn(async () => ({ id: 74, client_id: 67 })),
          };
        }
        if (entity === DossierBillingProfile) {
          return {
            findOne: jest.fn(async () => ({
              dossier_id: 74,
              currency: 'XAF',
              vat_rate: 0,
              default_vacation_rate: 80000,
            })),
          };
        }
        throw new Error(`Dépôt inattendu: ${String(entity)}`);
      }),
    } as unknown as EntityManager;
    const action = {
      id: 'action-1',
      dossier_id: 74,
      definition_code: 'AUDIENCE',
      definition_label: 'Audience tenue',
      definition_version: 2,
      definition: { default_rate: null },
      billing_decision: ActionBillingDecision.VACATION,
      completed_at: new Date('2026-10-05T08:00:00.000Z'),
      duration_minutes: 90,
      specific_data: {},
    } as DossierAction;

    const item = await new TenantContext().run(22, () =>
      service.createForCompletedAction(manager, action, 9),
    );

    expect(item).toMatchObject({
      category: BillableCategory.VACATION,
      calculation_mode: BillingCalculationMode.UNIT,
      unit_label: 'vacation',
      quantity: 1,
      unit_price: 80000,
      net_amount: 80000,
      status: BillableItemStatus.TO_INVOICE,
    });
    expect(eventAppend).toHaveBeenCalledTimes(1);
  });
});
