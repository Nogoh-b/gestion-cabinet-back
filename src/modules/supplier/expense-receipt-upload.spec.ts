import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { ConflictException } from '@nestjs/common';
import { TenantContext } from 'src/core/tenant/tenant.context';
import { FilesUtil } from 'src/core/shared/utils/file.util';
import { BillableItemStatus } from '../case-workflow/case-workflow.enums';
import { BillableItem } from '../case-workflow/entities/billing.entity';
import { ExpenseLine } from './entities/expense-line.entity';
import { ExpenseReportStatus } from './entities/expense-report.entity';
import { ExpenseLinesService } from './expense-lines.service';

afterEach(() => {
  jest.restoreAllMocks();
});

describe('Ajout de justificatif à une note de frais approuvée', () => {
  it('enregistre le fichier et recalcule le statut facturable', async () => {
    const line = {
      id: 7, expense_report_id: 12, attachment_url: null,
      expense_report: { status: ExpenseReportStatus.APPROVED },
    } as ExpenseLine;
    const lines = { findOne: jest.fn(async () => line), save: jest.fn(async (value: ExpenseLine) => value) };
    const items = { findOne: jest.fn(async () => ({ status: BillableItemStatus.NEEDS_REVIEW })) };
    const manager = { getRepository: jest.fn((entity: unknown) => entity === ExpenseLine ? lines : entity === BillableItem ? items : null) };
    const sync = jest.fn(async () => null);
    const service = new ExpenseLinesService({} as any, {
      transaction: (work: (manager: any) => Promise<unknown>) => work(manager),
    } as any, { syncExpenseLineToBillableItem: sync } as any);
    jest.spyOn(FilesUtil, 'uploadFileV1').mockImplementation(async () => ({
      filePath: 'unused.pdf', fileUrl: 'https://example.com/uploads/docs/expenses/3/12/receipt.pdf',
    }) as any);
    const bytes = Buffer.from('%PDF-1.7\n');
    const file = { buffer: bytes, size: bytes.length, mimetype: 'application/pdf', originalname: 'receipt.pdf' } as Express.Multer.File;
    const saved = await new TenantContext().run(3, () => service.attachReceipt(7, file, 9));
    expect(saved.attachment_url).toContain('receipt.pdf');
    expect(sync).toHaveBeenCalledWith(manager, line, 9, true);
    expect(items.findOne).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ tenant_id: 3 }),
    }));
  });

  it('refuse la modification d’une dépense déjà facturée', async () => {
    const line = { id: 7, attachment_url: null, expense_report: { status: ExpenseReportStatus.APPROVED } } as ExpenseLine;
    const lines = { findOne: jest.fn(async () => line) };
    const items = { findOne: jest.fn(async () => ({ status: BillableItemStatus.INVOICED })) };
    const manager = { getRepository: (entity: unknown) => entity === ExpenseLine ? lines : items };
    const service = new ExpenseLinesService({} as any, {
      transaction: (work: (manager: any) => Promise<unknown>) => work(manager),
    } as any, {} as any);
    const bytes = Buffer.from('%PDF-1.7\n');
    await expect(new TenantContext().run(3, () => service.attachReceipt(7, {
      buffer: bytes, size: bytes.length, mimetype: 'application/pdf', originalname: 'receipt.pdf',
    } as Express.Multer.File, 9))).rejects.toBeInstanceOf(ConflictException);
  });
});
