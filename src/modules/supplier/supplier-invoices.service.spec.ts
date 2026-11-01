import { runWithTenantContext } from 'src/core/tenant/tenant.context';
import {
  PaymentMethod,
  SupplierInvoice,
  SupplierInvoiceStatus,
} from './entities/supplier-invoice.entity';
import { SupplierInvoicesService } from './supplier-invoices.service';

describe('SupplierInvoicesService - cycle métier sécurisé', () => {
  const repository = {
    create: jest.fn(() => ({})),
    save: jest.fn(async (value) => value),
    findOne: jest.fn(),
  };
  const supplierRepo = {
    findOne: jest.fn(),
  };
  const branchRepo = {
    findOne: jest.fn(),
  };
  const transactionRepository = {
    save: jest.fn(async (value) => value),
  };
  const manager = {
    getRepository: jest.fn(() => transactionRepository),
  };
  const dataSource = {
    transaction: jest.fn(async (callback: any) => callback(manager)),
  };
  const outbox = {
    enqueue: jest.fn(),
  };
  const audit = {
    append: jest.fn(async () => ({ id: 'audit-supplier-1' })),
  };
  const evidenceStorage = {
    store: jest.fn(),
    read: jest.fn(),
    remove: jest.fn(),
  };
  let service: SupplierInvoicesService;

  const invoice = (
    status: SupplierInvoiceStatus,
  ): SupplierInvoice =>
    ({
      id: 4,
      tenant_id: 2,
      status,
      created_by_id: 8,
      supplier_id: 3,
      supplier: {
        id: 3,
        company_name: 'Fournisseur test',
        category: 'supplies',
      },
      invoice_number: 'FOUR-2026-14',
      invoice_date: new Date('2026-07-01'),
      due_date: new Date('2026-07-31'),
      amount_ht: 100,
      tax_rate: 20,
      amount_tva: 20,
      amount_ttc: 120,
    }) as SupplierInvoice;

  beforeEach(() => {
    jest.clearAllMocks();
    repository.create.mockReturnValue({});
    repository.save.mockImplementation(async (value) => value);
    transactionRepository.save.mockImplementation(async (value) => value);
    supplierRepo.findOne.mockResolvedValue({
      id: 3,
      company_name: 'Fournisseur test',
      category: 'supplies',
    });
    service = new SupplierInvoicesService(
      {} as any,
      repository as any,
      supplierRepo as any,
      branchRepo as any,
      dataSource as any,
      outbox as any,
      audit as any,
      evidenceStorage as any,
    );
  });

  it('crée toujours une facture reçue sans accepter de statut terminal', async () => {
    const result = await runWithTenantContext(2, () =>
      service.create(
        {
          supplier_id: 3,
          invoice_number: 'FOUR-2026-14',
          invoice_date: '2026-07-01',
          due_date: '2026-07-31',
          amount_ht: 100,
          tax_rate: 20,
          amount_tva: 20,
          amount_ttc: 120,
          status: SupplierInvoiceStatus.PAID,
        } as any,
        { userId: 8 },
      ),
    );

    expect(result.status).toBe(SupplierInvoiceStatus.RECEIVED);
    expect(result.created_by_id).toBe(8);
    expect(result.payment_date).toBeNull();
  });

  it('attache un justificatif privé vérifié avant approbation', async () => {
    const value = invoice(SupplierInvoiceStatus.RECEIVED);
    jest.spyOn(service as any, 'lockInvoice').mockResolvedValue(value);
    evidenceStorage.store.mockResolvedValue({
      storageKey: 'tenants/2/supplier-evidence/invoice/private.pdf',
      originalName: 'facture.pdf',
      mimeType: 'application/pdf',
      size: 24,
      sha256: 'a'.repeat(64),
    });

    const result = await runWithTenantContext(2, () =>
      service.attachEvidence(
        value.id,
        { buffer: Buffer.from('%PDF-1.7') } as Express.Multer.File,
        { userId: 9 },
      ),
    );

    expect(result.attachment_url).toContain('/supplier-evidence/invoice/');
    expect(result.attachment_sha256).toBe('a'.repeat(64));
    expect(audit.append).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({
        action: 'supplier_invoice.evidence.attached',
      }),
    );
  });

  it('interdit à l’auteur de s’auto-approuver', async () => {
    const value = invoice(SupplierInvoiceStatus.RECEIVED);
    jest.spyOn(service as any, 'lockInvoice').mockResolvedValue(value);

    await expect(
      runWithTenantContext(2, () =>
        service.approve(value.id, { userId: 8 }),
      ),
    ).rejects.toThrow('lui-même');
    expect(outbox.enqueue).not.toHaveBeenCalled();
  });

  it('approuve sous verrou et publie un événement durable', async () => {
    const value = invoice(SupplierInvoiceStatus.RECEIVED);
    jest.spyOn(service as any, 'lockInvoice').mockResolvedValue(value);

    const result = await runWithTenantContext(2, () =>
      service.approve(value.id, { userId: 9 }),
    );

    expect(result.status).toBe(SupplierInvoiceStatus.APPROVED);
    expect(result.approved_by_id).toBe(9);
    expect(outbox.enqueue).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({
        eventType: 'supplier_invoice.approved',
      }),
    );
  });

  it('ne paie qu’une facture approuvée et trace la référence', async () => {
    const value = invoice(SupplierInvoiceStatus.APPROVED);
    jest.spyOn(service as any, 'lockInvoice').mockResolvedValue(value);

    const result = await runWithTenantContext(2, () =>
      service.markAsPaid(
        value.id,
        {
          paymentMethod: PaymentMethod.VIREMENT,
          paymentDate: '2026-07-20',
          paymentReference: 'VIR-2026-0088',
        },
        { userId: 10 },
      ),
    );

    expect(result.status).toBe(SupplierInvoiceStatus.PAID);
    expect(result.payment_reference).toBe('VIR-2026-0088');
    expect(outbox.enqueue).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({
        eventType: 'supplier_invoice.paid',
      }),
    );
  });
});
