import { describe, expect, it, jest } from '@jest/globals';
import { TenantContext } from 'src/core/tenant/tenant.context';
import { Dossier } from 'src/modules/dossiers/entities/dossier.entity';
import {
  ExpenseLine,
  ExpenseRebillingType,
} from 'src/modules/supplier/entities/expense-line.entity';
import {
  ExpenseReport,
  ExpenseReportStatus,
} from 'src/modules/supplier/entities/expense-report.entity';
import { EntityManager } from 'typeorm';
import {
  BillableCategory,
  BillableItemStatus,
  BillingCalculationMode,
  WorkflowEngine,
} from '../case-workflow.enums';
import {
  BillableItem,
  DossierBillingProfile,
} from '../entities/billing.entity';
import { DossierAction } from '../entities/dossier-action.entity';
import { CaseBillingService } from './case-billing.service';

function createService(eventAppend = jest.fn(async () => undefined)) {
  return {
    service: new CaseBillingService(
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
    ),
    eventAppend,
  };
}

function expenseLine(patch: Partial<ExpenseLine> = {}): ExpenseLine {
  return {
    id: 31,
    tenant_id: 22,
    expense_report_id: 8,
    expense_report: {
      id: 8,
      status: ExpenseReportStatus.APPROVED,
    } as ExpenseReport,
    expense_date: new Date('2026-10-05'),
    description: 'Frais de greffe',
    category: 'court_fees' as any,
    amount_ht: 40000,
    tax_rate: 19.25,
    amount_ttc: 47700,
    is_rebillable: true,
    rebilling_type: ExpenseRebillingType.EXPENSE,
    action_id: null,
    currency: 'XAF',
    dossier_id: 74,
    attachment_url: 'https://example.test/recu.pdf',
    ...patch,
  } as ExpenseLine;
}

function managerFor(options: {
  existing?: BillableItem | null;
  profile?: Partial<DossierBillingProfile> | null;
  savedItems?: BillableItem[];
  actionExists?: boolean;
}): EntityManager {
  const savedItems = options.savedItems ?? [];
  const itemRepository = {
    findOne: jest.fn(async () => options.existing ?? null),
    create: jest.fn((value: any) => value),
    save: jest.fn(async (value: any) => {
      const saved = { id: value.id ?? 'item-expense', ...value };
      savedItems.push(saved);
      return saved;
    }),
  };
  return {
    getRepository: jest.fn((entity: unknown) => {
      if (entity === BillableItem) return itemRepository;
      if (entity === DossierBillingProfile) {
        return {
          findOne: jest.fn(async () =>
            options.profile === null
              ? null
              : {
                  dossier_id: 74,
                  currency: 'XAF',
                  rebill_expenses: true,
                  rebill_disbursements: true,
                  require_disbursement_receipt: true,
                  ...options.profile,
                },
          ),
        };
      }
      if (entity === Dossier) {
        return {
          findOne: jest.fn(async () => ({
            id: 74,
            client_id: 67,
            workflow_engine: WorkflowEngine.ACTIONS_V2,
          })),
        };
      }
      if (entity === DossierAction) {
        return {
          findOne: jest.fn(async () =>
            options.actionExists === false ? null : { id: 'action-1' },
          ),
        };
      }
      throw new Error(`Dépôt inattendu: ${String(entity)}`);
    }),
  } as unknown as EntityManager;
}

describe('CaseBillingService - dépenses refacturables', () => {
  it('crée un frais au coût réel après approbation', async () => {
    const { service, eventAppend } = createService();
    const savedItems: BillableItem[] = [];
    const manager = managerFor({ savedItems });

    const item = await new TenantContext().run(22, () =>
      service.syncExpenseLineToBillableItem(
        manager,
        expenseLine(),
        9,
        true,
      ),
    );

    expect(item).toMatchObject({
      source_event_key: 'EXPENSE:31:APPROVED',
      category: BillableCategory.EXPENSE,
      calculation_mode: BillingCalculationMode.ACTUAL_COST,
      quantity: 1,
      net_amount: 40000,
      tax_amount: 7700,
      gross_amount: 47700,
      status: BillableItemStatus.TO_INVOICE,
    });
    expect(savedItems).toHaveLength(1);
    expect(eventAppend).toHaveBeenCalledTimes(1);
  });

  it('place un débours sans justificatif en vérification', async () => {
    const { service } = createService();
    const manager = managerFor({});

    const item = await new TenantContext().run(22, () =>
      service.syncExpenseLineToBillableItem(
        manager,
        expenseLine({
          rebilling_type: ExpenseRebillingType.DISBURSEMENT,
          attachment_url: null,
        }),
        9,
        true,
      ),
    );

    expect(item).toMatchObject({
      category: BillableCategory.DISBURSEMENT,
      status: BillableItemStatus.NEEDS_REVIEW,
      review_reason: 'Justificatif obligatoire pour ce débours',
    });
  });

  it('conserve le lien facultatif vers l’action ayant généré la dépense', async () => {
    const { service } = createService();
    const manager = managerFor({ actionExists: true });

    const item = await new TenantContext().run(22, () =>
      service.syncExpenseLineToBillableItem(
        manager,
        expenseLine({ action_id: 'action-1' }),
        9,
        true,
      ),
    );

    expect(item).toMatchObject({
      action_id: 'action-1',
      status: BillableItemStatus.TO_INVOICE,
    });
  });

  it('met à jour le même élément avant facturation', async () => {
    const { service } = createService();
    const existing = {
      id: 'item-existing',
      dossier_id: 74,
      status: BillableItemStatus.TO_INVOICE,
      source_event_key: 'EXPENSE:31:APPROVED',
    } as BillableItem;
    const savedItems: BillableItem[] = [];
    const manager = managerFor({ existing, savedItems });

    const item = await new TenantContext().run(22, () =>
      service.syncExpenseLineToBillableItem(
        manager,
        expenseLine({ amount_ht: 50000, amount_ttc: 59625 }),
        9,
        true,
      ),
    );

    expect(item).toMatchObject({
      id: 'item-existing',
      net_amount: 50000,
      gross_amount: 59625,
      status: BillableItemStatus.TO_INVOICE,
    });
    expect(savedItems).toHaveLength(1);
  });

  it('abandonne l’élément si la dépense n’est plus refacturable', async () => {
    const { service } = createService();
    const existing = {
      id: 'item-existing',
      dossier_id: 74,
      status: BillableItemStatus.TO_INVOICE,
      source_event_key: 'EXPENSE:31:APPROVED',
    } as BillableItem;
    const manager = managerFor({ existing });

    const item = await new TenantContext().run(22, () =>
      service.syncExpenseLineToBillableItem(
        manager,
        expenseLine({ is_rebillable: false }),
        9,
        true,
      ),
    );

    expect(item).toMatchObject({
      status: BillableItemStatus.WAIVED,
      review_reason: 'La dépense n’est plus refacturable',
    });
  });

  it('ne modifie jamais un élément déjà facturé', async () => {
    const { service, eventAppend } = createService();
    const existing = {
      id: 'item-invoiced',
      dossier_id: 74,
      status: BillableItemStatus.INVOICED,
      gross_amount: 47700,
      source_event_key: 'EXPENSE:31:APPROVED',
    } as BillableItem;
    const savedItems: BillableItem[] = [];
    const manager = managerFor({ existing, savedItems });

    const item = await new TenantContext().run(22, () =>
      service.syncExpenseLineToBillableItem(
        manager,
        expenseLine({ amount_ttc: 60000 }),
        9,
        true,
      ),
    );

    expect(item).toBe(existing);
    expect(savedItems).toHaveLength(0);
    expect(eventAppend).not.toHaveBeenCalled();
  });
});
