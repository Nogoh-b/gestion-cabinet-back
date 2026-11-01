import { runWithTenantContext } from 'src/core/tenant/tenant.context';
import { User } from '../iam/user/entities/user.entity';
import { ExpenseReport, ExpenseReportStatus } from './entities/expense-report.entity';
import { PaymentMethod } from './entities/supplier-invoice.entity';
import { ExpenseReportsService } from './expense-reports.service';

describe('ExpenseReportsService - préparation, validation et remboursement', () => {
  const reportRepository = {
    save: jest.fn(async (value) => value),
  };
  const userRepository = {
    findOne: jest.fn(),
  };
  const manager = {
    getRepository: jest.fn((entity) =>
      entity === User ? userRepository : reportRepository,
    ),
  };
  const dataSource = {
    transaction: jest.fn(async (callback: any) => callback(manager)),
  };
  const outbox = {
    enqueue: jest.fn(),
  };
  const audit = {
    append: jest.fn(async () => ({ id: 'audit-expense-1' })),
  };
  let service: ExpenseReportsService;

  const report = (
    status: ExpenseReportStatus,
  ): ExpenseReport =>
    ({
      id: 12,
      tenant_id: 2,
      employee_id: 21,
      employee: { id: 21, full_name: 'Auteur Note' },
      title: 'Déplacement audience',
      status,
      total_amount: 1,
      lines: [
        {
          id: 1,
          category: 'transport',
          description: 'Transport',
          amount_ttc: 40.25,
        },
        {
          id: 2,
          category: 'meal',
          description: 'Repas',
          amount_ttc: 15.75,
        },
      ],
    }) as ExpenseReport;

  beforeEach(() => {
    jest.clearAllMocks();
    reportRepository.save.mockImplementation(async (value) => value);
    service = new ExpenseReportsService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      dataSource as any,
      outbox as any,
      audit as any,
    );
  });

  it('recalcule le total à partir des lignes lors de la soumission', async () => {
    const value = report(ExpenseReportStatus.DRAFT);
    jest.spyOn(service as any, 'lockReport').mockResolvedValue(value);
    userRepository.findOne.mockResolvedValue({
      id: 5,
      employee: { id: 21 },
    });

    const result = await runWithTenantContext(2, () =>
      service.submit(value.id, { userId: 5, role: 'avocat' }),
    );

    expect(result.status).toBe(ExpenseReportStatus.SUBMITTED);
    expect(result.total_amount).toBe(56);
    expect(audit.append).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({
        action: 'expense_report.submitted',
      }),
    );
  });

  it('interdit à l’auteur de valider sa propre note', async () => {
    const value = report(ExpenseReportStatus.SUBMITTED);
    jest.spyOn(service as any, 'lockReport').mockResolvedValue(value);
    userRepository.findOne.mockResolvedValue({
      id: 5,
      employee: { id: 21 },
    });

    await expect(
      runWithTenantContext(2, () =>
        service.approve(value.id, { userId: 5 }),
      ),
    ).rejects.toThrow('lui-même');
  });

  it('approuve une note soumise avec un validateur distinct', async () => {
    const value = report(ExpenseReportStatus.SUBMITTED);
    jest.spyOn(service as any, 'lockReport').mockResolvedValue(value);
    userRepository.findOne.mockResolvedValue({
      id: 6,
      employee: { id: 22 },
    });

    const result = await runWithTenantContext(2, () =>
      service.approve(value.id, { userId: 6 }),
    );

    expect(result.status).toBe(ExpenseReportStatus.APPROVED);
    expect(result.approved_by_id).toBe(22);
  });

  it('rembourse seulement après approbation et publie l’outbox', async () => {
    const value = report(ExpenseReportStatus.APPROVED);
    jest.spyOn(service as any, 'lockReport').mockResolvedValue(value);
    userRepository.findOne.mockResolvedValue({
      id: 8,
      employee: { id: 23 },
    });

    const result = await runWithTenantContext(2, () =>
      service.markReimbursed(
        value.id,
        {
          paymentMethod: PaymentMethod.VIREMENT,
          paymentReference: 'REM-2026-001',
          reimbursementDate: '2026-07-22',
        },
        { userId: 8 },
      ),
    );

    expect(result.status).toBe(ExpenseReportStatus.REIMBURSED);
    expect(result.reimbursement_reference).toBe('REM-2026-001');
    expect(outbox.enqueue).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({
        eventType: 'expense_report.reimbursed',
      }),
    );
  });
});
