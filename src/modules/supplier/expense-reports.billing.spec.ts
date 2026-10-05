import { describe, expect, it, jest } from '@jest/globals';
import { TenantContext } from 'src/core/tenant/tenant.context';
import { User } from 'src/modules/iam/user/entities/user.entity';
import { ExpenseLine } from './entities/expense-line.entity';
import {
  ExpenseReport,
  ExpenseReportStatus,
} from './entities/expense-report.entity';
import { ExpenseReportsService } from './expense-reports.service';

function setup(status = ExpenseReportStatus.SUBMITTED) {
  const lines = [{ id: 31 }, { id: 32 }] as ExpenseLine[];
  const report = {
    id: 8,
    tenant_id: 22,
    status,
    lines,
    notes: null,
  } as unknown as ExpenseReport;
  const reportRepository = {
    findOne: jest.fn(async () => report),
    save: jest.fn(async (value: ExpenseReport) => value),
  };
  const manager = {
    getRepository: jest.fn((entity: unknown) => {
      if (entity === ExpenseReport) return reportRepository;
      if (entity === User) {
        return { findOne: jest.fn(async () => ({ id: 9 })) };
      }
      throw new Error(`Dépôt inattendu: ${String(entity)}`);
    }),
  };
  const dataSource = {
    transaction: jest.fn(async (work: (value: any) => Promise<any>) =>
      work(manager),
    ),
  };
  const syncExpenseLineToBillableItem = jest.fn(async () => null);
  const service = new ExpenseReportsService(
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    dataSource as any,
    { syncExpenseLineToBillableItem } as any,
  );
  return {
    service,
    report,
    lines,
    manager,
    reportRepository,
    syncExpenseLineToBillableItem,
  };
}

describe('ExpenseReportsService - synchronisation de facturation', () => {
  it('synchronise chaque ligne lors de l’approbation', async () => {
    const context = setup();

    const saved = await new TenantContext().run(22, () =>
      context.service.approve(8, 9),
    );

    expect(saved.status).toBe(ExpenseReportStatus.APPROVED);
    expect(context.syncExpenseLineToBillableItem).toHaveBeenCalledTimes(2);
    expect(context.syncExpenseLineToBillableItem).toHaveBeenNthCalledWith(
      1,
      context.manager,
      context.lines[0],
      9,
      true,
    );
  });

  it('abandonne les éléments encore modifiables lors du rejet', async () => {
    const context = setup(ExpenseReportStatus.APPROVED);

    const saved = await new TenantContext().run(22, () =>
      context.service.reject(8, 9, 'Justificatif invalide'),
    );

    expect(saved.status).toBe(ExpenseReportStatus.REJECTED);
    expect(saved.notes).toBe('Justificatif invalide');
    expect(context.syncExpenseLineToBillableItem).toHaveBeenCalledTimes(2);
    expect(context.syncExpenseLineToBillableItem).toHaveBeenNthCalledWith(
      1,
      context.manager,
      context.lines[0],
      9,
      false,
    );
  });
});
