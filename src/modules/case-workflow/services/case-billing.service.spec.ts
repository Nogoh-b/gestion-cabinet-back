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
});
