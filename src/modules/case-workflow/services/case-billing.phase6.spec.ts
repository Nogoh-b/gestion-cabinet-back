import { ConflictException } from '@nestjs/common';
import { describe, expect, it, jest } from '@jest/globals';
import { TenantContext } from 'src/core/tenant/tenant.context';
import { Dossier } from 'src/modules/dossiers/entities/dossier.entity';
import {
  ExpenseLine,
  ExpenseRebillingType,
} from 'src/modules/supplier/entities/expense-line.entity';
import { ExpenseReportStatus } from 'src/modules/supplier/entities/expense-report.entity';
import { BillableItem, DossierBillingProfile } from '../entities/billing.entity';
import { WorkflowEngine } from '../case-workflow.enums';
import { CaseBillingService } from './case-billing.service';
import { BillingReconciliationService } from './billing-reconciliation.service';

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

describe('CaseBillingService - moteur réservé aux dossiers ACTIONS_V2 (phase 6)', () => {
  it('ignore la synchronisation des dépenses sur un dossier legacy', async () => {
    const service = createService();
    const save = jest.fn(async (value: any) => value);
    const repositories = new Map<unknown, any>([
      [BillableItem, { findOne: jest.fn(async () => null), save }],
      [DossierBillingProfile, { findOne: jest.fn(async () => null) }],
      [
        Dossier,
        {
          findOne: jest.fn(async () => ({
            id: 74,
            client_id: 67,
            workflow_engine: WorkflowEngine.LEGACY,
          })),
        },
      ],
    ]);
    const manager = {
      getRepository: jest.fn((entity: unknown) => {
        const repository = repositories.get(entity);
        if (!repository) throw new Error(`Dépôt inattendu: ${String(entity)}`);
        return repository;
      }),
    } as any;
    const expenseLine = {
      id: 501,
      tenant_id: 22,
      dossier_id: 74,
      is_rebillable: true,
      rebilling_type: ExpenseRebillingType.EXPENSE,
      expense_report: { status: ExpenseReportStatus.APPROVED },
    } as unknown as ExpenseLine;

    const result = await new TenantContext().run(22, () =>
      service.syncExpenseLineToBillableItem(manager, expenseLine, 9),
    );

    expect(result).toBeNull();
    expect(save).not.toHaveBeenCalled();
  });

  it('refuse l’honoraire de résultat sur un dossier legacy', async () => {
    const service = createService();
    Object.assign(service as object, {
      dossierRepository: {
        findOne: jest.fn(async () => ({
          id: 74,
          client_id: 67,
          workflow_engine: WorkflowEngine.LEGACY,
        })),
      },
      profileRepository: {
        findOne: jest.fn(async () => ({
          tenant_id: 22,
          dossier_id: 74,
          mode: 'FIXED',
          currency: 'XAF',
          vat_rate: 0,
        })),
      },
    });

    await expect(
      new TenantContext().run(22, () =>
        service.validateResultFee(
          74,
          {
            base_amount: 1000000,
            result_reference: 'Jugement RG 25/00123',
          } as any,
          'legacy-key-1',
          9,
        ),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('BillingReconciliationService - rapprochement (phase 6)', () => {
  function chainable(lines: unknown[]) {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const chain: any = {};
    for (const method of ['where', 'andWhere', 'orderBy', 'limit']) {
      chain[method] = jest.fn((...args: unknown[]) => {
        calls.push({ method, args });
        return chain;
      });
    }
    chain.innerJoin = jest.fn(() => chain);
    chain.leftJoin = jest.fn(() => chain);
    chain.getMany = jest.fn(async () => lines);
    return { chain, calls };
  }

  const approvedLine = {
    id: 501,
    expense_report_id: 60,
    dossier_id: 74,
    description: 'Acte d’huissier',
    amount_ht: 25000,
    amount_ttc: 25000,
    action_id: null,
  };

  it('liste en dry-run sans rien synchroniser', async () => {
    const { chain, calls } = chainable([approvedLine]);
    const syncExpenseLineById = jest.fn(async () => ({ id: 'item-1' }));
    const service = new BillingReconciliationService(
      {
        getRepository: jest.fn(() => ({
          createQueryBuilder: jest.fn(() => chain),
        })),
      } as any,
      { syncExpenseLineById } as any,
    );

    const report = await service.reconcile({
      tenantId: 22,
      dossierId: 74,
      limit: 200,
      apply: false,
      actorUserId: null,
    });

    expect(report.dry_run).toBe(true);
    expect(report.examined).toBe(1);
    expect(report.missing).toMatchObject([
      { expense_line_id: 501, dossier_id: 74, amount_ttc: 25000 },
    ]);
    expect(report.synced).toHaveLength(0);
    expect(syncExpenseLineById).not.toHaveBeenCalled();
    expect(
      calls.some(
        (call) =>
          call.method === 'andWhere' &&
          String(call.args[0]).includes('line.dossier_id = :dossierId'),
      ),
    ).toBe(true);
  });

  it('synchronise en apply et collecte les échecs sans tout bloquer', async () => {
    const { chain } = chainable([
      approvedLine,
      { ...approvedLine, id: 502, description: 'Greffe' },
    ]);
    const syncExpenseLineById = jest.fn(async (id: number) => {
      if (id === 502) throw new Error('Dossier verrouillé');
      return { id: 'item-1', status: 'TO_INVOICE' };
    });
    const service = new BillingReconciliationService(
      {
        getRepository: jest.fn(() => ({
          createQueryBuilder: jest.fn(() => chain),
        })),
      } as any,
      { syncExpenseLineById } as any,
    );

    const report = await service.reconcile({
      tenantId: 22,
      limit: 200,
      apply: true,
      actorUserId: 9,
    });

    expect(report.dry_run).toBe(false);
    expect(report.synced).toMatchObject([
      { expense_line_id: 501, billable_item_id: 'item-1' },
    ]);
    expect(report.failed).toMatchObject([
      { expense_line_id: 502, error: 'Dossier verrouillé' },
    ]);
  });
});
