import { describe, expect, it, jest } from '@jest/globals';
import { ConflictException, BadRequestException } from '@nestjs/common';
import { TenantContext } from 'src/core/tenant/tenant.context';
import { BillableItemStatus } from '../case-workflow/case-workflow.enums';
import { BillableItem } from '../case-workflow/entities/billing.entity';
import { CaseBillingService } from '../case-workflow/services/case-billing.service';
import { ExpenseLine, ExpenseRebillingType } from './entities/expense-line.entity';
import { ExpenseReportStatus } from './entities/expense-report.entity';

function setup(reviewReason = 'Justificatif obligatoire pour ce débours') {
  const item = {
    id: 'item-8', dossier_id: 42, lock_version: 2,
    status: BillableItemStatus.NEEDS_REVIEW,
    review_reason: reviewReason,
    calculation_snapshot: { expenseLineId: 7 },
  } as unknown as BillableItem;
  const line = {
    id: 7, dossier_id: 42, is_rebillable: true,
    rebilling_type: ExpenseRebillingType.DISBURSEMENT,
    attachment_url: null,
    expense_report: { status: ExpenseReportStatus.APPROVED },
  } as ExpenseLine;
  const repository = {
    findOne: jest.fn(async () => item),
    save: jest.fn(async (value: BillableItem) => value),
  };
  const manager = {
    getRepository: jest.fn((entity: unknown) => {
      if (entity === BillableItem) return repository;
      throw new Error('Dépôt inattendu');
    }),
  };
  const append = jest.fn(async () => null);
  const service = Object.create(CaseBillingService.prototype) as CaseBillingService;
  Object.assign(service, { eventService: { append } });
  return { service, line, item, manager, repository, append };
}

describe('Dérogation individuelle pour débours sans justificatif', () => {
  it('enregistre le motif, auteur et audit, puis rend le débours facturable', async () => {
    const ctx = setup();
    const saved = await new TenantContext().run(3, () =>
      ctx.service.approveExpenseWithoutReceipt(ctx.manager as any, ctx.line, 9, 'Reçu non disponible'),
    );
    expect(saved.status).toBe(BillableItemStatus.TO_INVOICE);
    expect(saved.review_reason).toBeNull();
    expect(saved.calculation_snapshot.receiptOverride).toEqual(expect.objectContaining({
      actorUserId: 9, reason: 'Reçu non disponible',
    }));
    expect(ctx.append).toHaveBeenCalledWith(ctx.manager, expect.objectContaining({
      eventType: 'EXPENSE_RECEIPT_EXCEPTION_APPROVED', actorUserId: 9,
    }));
  });

  it('refuse de contourner un autre blocage ou un élément déjà facturé', async () => {
    const ctx = setup('Montant réel de la dépense incohérent');
    await expect(new TenantContext().run(3, () =>
      ctx.service.approveExpenseWithoutReceipt(ctx.manager as any, ctx.line, 9, 'Absence de reçu'),
    )).rejects.toBeInstanceOf(ConflictException);
    ctx.item.review_reason = 'Justificatif obligatoire pour ce débours';
    ctx.item.status = BillableItemStatus.INVOICED;
    await expect(new TenantContext().run(3, () =>
      ctx.service.approveExpenseWithoutReceipt(ctx.manager as any, ctx.line, 9, 'Absence de reçu'),
    )).rejects.toBeInstanceOf(ConflictException);
    expect(ctx.repository.save).not.toHaveBeenCalled();
  });

  it('impose un motif de dérogation explicite', async () => {
    const ctx = setup();
    await expect(new TenantContext().run(3, () =>
      ctx.service.approveExpenseWithoutReceipt(ctx.manager as any, ctx.line, 9, 'court'),
    )).rejects.toBeInstanceOf(BadRequestException);
    expect(ctx.repository.save).not.toHaveBeenCalled();
  });
});
