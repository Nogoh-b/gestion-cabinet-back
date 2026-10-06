import { describe, expect, it, jest } from '@jest/globals';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Dossier } from 'src/modules/dossiers/entities/dossier.entity';
import { DossierAction } from 'src/modules/case-workflow/entities/dossier-action.entity';
import { DossierBillingProfile } from 'src/modules/case-workflow/entities/billing.entity';
import { Branch } from 'src/modules/agencies/branch/entities/branch.entity';
import { Employee } from 'src/modules/agencies/employee/entities/employee.entity';
import { Supplier } from './entities/supplier.entity';
import { SupplierInvoice } from './entities/supplier-invoice.entity';
import { ExpenseLine } from './entities/expense-line.entity';
import { ExpenseReport } from './entities/expense-report.entity';
import {
  CreateUnifiedExpenseDto,
  ExpenseWorkspaceFinalization,
  ExpenseWorkspaceOrigin,
  ExpenseWorkspaceTarget,
} from './dto/expense-workspace.dto';
import { ExpenseWorkspaceService } from './expense-workspace.service';

jest.mock('src/core/tenant/tenant.context', () => ({
  getCurrentTenantId: () => 22,
}));

const adminUser = { id: 9, userId: 9, role: 'admin' } as any;

function setup(profile: { vat_rate: number; currency: string } | null = null) {
  const profileRepository = {
    findOne: jest.fn(async () =>
      profile ? ({ ...profile } as unknown as DossierBillingProfile) : null,
    ),
  };
  const savedInvoices: Record<string, unknown>[] = [];
  const savedLines: Record<string, unknown>[] = [];
  const manager = {
    getRepository: jest.fn((entity: unknown) => {
      if (entity === Supplier)
        return { findOne: jest.fn(async () => ({ id: 3 })) };
      if (entity === Branch) return { findOne: jest.fn(async () => null) };
      if (entity === Dossier)
        return { findOne: jest.fn(async () => ({ id: 59 })) };
      if (entity === DossierAction)
        return { findOne: jest.fn(async () => null) };
      if (entity === DossierBillingProfile) return profileRepository;
      if (entity === SupplierInvoice)
        return {
          create: jest.fn((value: object) => value),
          save: jest.fn(async (value: object) => {
            savedInvoices.push(value as Record<string, unknown>);
            return { ...(value as object), id: 5 };
          }),
        };
      if (entity === Employee)
        return { findOne: jest.fn(async () => ({ id: 7 })) };
      if (entity === ExpenseReport)
        return {
          create: jest.fn((value: object) => value),
          save: jest.fn(async (value: object) => ({
            ...(value as object),
            id: 11,
          })),
        };
      if (entity === ExpenseLine)
        return {
          create: jest.fn((value: object) => value),
          save: jest.fn(async (value: object) => {
            savedLines.push(value as Record<string, unknown>);
            return { ...(value as object), id: 100 + savedLines.length };
          }),
        };
      throw new Error(`Dépôt inattendu: ${String(entity)}`);
    }),
  };
  const dataSource = {
    transaction: jest.fn(async (work: (value: any) => Promise<any>) =>
      work(manager),
    ),
  };
  const service = new ExpenseWorkspaceService(
    dataSource as any,
    {
      syncExpenseLineToBillableItem: jest.fn(async () => null),
      syncSupplierInvoiceToBillableItem: jest.fn(async () => null),
    } as any,
    { emit: jest.fn() } as any,
    {
      checkModuleEnabled: jest.fn(async () => undefined),
      checkLimit: jest.fn(async () => undefined),
    } as any,
    {} as any,
    { count: jest.fn(async () => 0) } as any,
    {} as any,
  );
  return { service, profileRepository, savedInvoices, savedLines };
}

describe('ExpenseWorkspaceService - TVA et devise héritées du dossier', () => {
  it('applique la TVA du profil dossier à une facture fournisseur sans taux', async () => {
    const context = setup({ vat_rate: 19.25, currency: 'XAF' });

    const result = await context.service.create(
      {
        origin: ExpenseWorkspaceOrigin.SUPPLIER_INVOICE,
        target: ExpenseWorkspaceTarget.DOSSIER,
        finalization: ExpenseWorkspaceFinalization.SUBMIT,
        dossier_id: 59,
        rebilling_type: 'EXPENSE',
        supplier_invoice: {
          supplier_id: 3,
          invoice_date: '2026-10-01',
          due_date: '2026-10-31',
          amount_ht: 100000,
        },
      } as any,
      adminUser,
    );

    expect(result.id).toBe(5);
    expect(context.savedInvoices).toHaveLength(1);
    expect(context.savedInvoices[0]).toMatchObject({
      tax_rate: 19.25,
      amount_tva: 19250,
      amount_ttc: 119250,
      currency: 'XAF',
      is_rebillable: true,
      dossier_id: 59,
    });
  });

  it('garde le taux explicite, même à zéro, devant le profil dossier', async () => {
    const context = setup({ vat_rate: 19.25, currency: 'XAF' });

    await context.service.create(
      {
        origin: ExpenseWorkspaceOrigin.SUPPLIER_INVOICE,
        target: ExpenseWorkspaceTarget.DOSSIER,
        finalization: ExpenseWorkspaceFinalization.SUBMIT,
        dossier_id: 59,
        rebilling_type: 'DISBURSEMENT',
        currency: 'EUR',
        supplier_invoice: {
          supplier_id: 3,
          invoice_date: '2026-10-01',
          due_date: '2026-10-31',
          amount_ht: 100000,
          tax_rate: 0,
        },
      } as any,
      adminUser,
    );

    expect(context.savedInvoices[0]).toMatchObject({
      tax_rate: 0,
      amount_tva: 0,
      amount_ttc: 100000,
      currency: 'EUR',
    });
  });

  it('hérite la TVA du dossier sur chaque ligne de note de frais', async () => {
    const context = setup({ vat_rate: 19.25, currency: 'XAF' });

    await context.service.create(
      {
        origin: ExpenseWorkspaceOrigin.EMPLOYEE_REPORT,
        target: ExpenseWorkspaceTarget.DOSSIER,
        finalization: ExpenseWorkspaceFinalization.SUBMIT,
        dossier_id: 59,
        rebilling_type: 'EXPENSE',
        expense_report: {
          employee_id: 7,
          title: 'Déplacement audience',
          submission_date: '2026-10-02',
          lines: [
            {
              expense_date: '2026-10-02',
              description: 'Taxi',
              category: 'transport',
              amount_ht: 10000,
            },
          ],
        },
      } as any,
      adminUser,
    );

    expect(context.savedLines).toHaveLength(1);
    expect(context.savedLines[0]).toMatchObject({
      tax_rate: 19.25,
      amount_ht: 10000,
      amount_ttc: 11925,
      currency: 'XAF',
      is_rebillable: true,
      dossier_id: 59,
    });
  });

  it('reste à zéro sans dossier, sans lire le profil', async () => {
    const context = setup({ vat_rate: 19.25, currency: 'XAF' });

    await context.service.create(
      {
        origin: ExpenseWorkspaceOrigin.SUPPLIER_INVOICE,
        target: ExpenseWorkspaceTarget.INTERNAL,
        finalization: ExpenseWorkspaceFinalization.SUBMIT,
        supplier_invoice: {
          supplier_id: 3,
          invoice_date: '2026-10-01',
          due_date: '2026-10-31',
          amount_ht: 50000,
        },
      } as any,
      adminUser,
    );

    expect(context.profileRepository.findOne).not.toHaveBeenCalled();
    expect(context.savedInvoices[0]).toMatchObject({
      tax_rate: 0,
      amount_tva: 0,
      amount_ttc: 50000,
      is_rebillable: false,
    });
  });
});

describe('CreateUnifiedExpenseDto - validation', () => {
  it('accepte une dépense de dossier sans TVA ni TTC', async () => {
    const dto = plainToInstance(CreateUnifiedExpenseDto, {
      origin: 'SUPPLIER_INVOICE',
      target: 'DOSSIER',
      finalization: 'SUBMIT',
      dossier_id: 59,
      rebilling_type: 'EXPENSE',
      supplier_invoice: {
        supplier_id: 3,
        invoice_date: '2026-10-01',
        due_date: '2026-10-31',
        amount_ht: 100000,
      },
    });

    expect(await validate(dto)).toHaveLength(0);
  });

  it('exige toujours le montant HT', async () => {
    const dto = plainToInstance(CreateUnifiedExpenseDto, {
      origin: 'SUPPLIER_INVOICE',
      target: 'DOSSIER',
      finalization: 'SUBMIT',
      dossier_id: 59,
      rebilling_type: 'EXPENSE',
      supplier_invoice: {
        supplier_id: 3,
        invoice_date: '2026-10-01',
        due_date: '2026-10-31',
      },
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});
