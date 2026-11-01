import { runWithTenantContext } from 'src/core/tenant/tenant.context';
import { StatutPaiement } from '../paiement/dto/create-paiement.dto';
import { Paiement } from '../paiement/entities/paiement.entity';
import {
  InvoiceNature,
  InvoiceSettlementDisposition,
  StatutFacture,
} from './dto/create-facture.dto';
import { Facture } from './entities/facture.entity';
import { FactureService } from './facture.service';

describe('FactureService - cycle métier', () => {
  const invoiceRepository = {
    save: jest.fn(async (value) => value),
    findOne: jest.fn(),
  };
  const paymentRepository = {
    count: jest.fn(),
  };
  const manager = {
    getRepository: jest.fn((entity) =>
      entity === Paiement ? paymentRepository : invoiceRepository,
    ),
    query: jest.fn(),
  };
  const dataSource = {
    transaction: jest.fn(async (...args: any[]) => {
      const callback = args[args.length - 1];
      return callback(manager);
    }),
  };
  const outbox = { enqueue: jest.fn() };
  const audit = {
    append: jest.fn(async () => ({ id: 'audit-invoice-1' })),
  };
  const cabinetRepository = {
    findOne: jest.fn(),
  };
  let service: FactureService;

  const invoice = (status: StatutFacture): Facture =>
    ({
      id: 'invoice-1',
      dossier_id: 22,
      client_id: 8,
      numero: 'FAC-2026-0001',
      dateFacture: new Date('2026-07-01'),
      dateEcheance: new Date('2026-07-31'),
      montantHT: 100,
      montantTVA: 20,
      montantTTC: 120,
      status,
      nature: InvoiceNature.STANDARD,
    }) as Facture;

  beforeEach(() => {
    jest.clearAllMocks();
    invoiceRepository.save.mockImplementation(async (value) => value);
    invoiceRepository.findOne.mockResolvedValue({
      id: 'invoice-1',
      nature: InvoiceNature.STANDARD,
    });
    paymentRepository.count.mockResolvedValue(0);
    cabinetRepository.findOne.mockResolvedValue({
      invoice_prefix: 'FAC-',
      invoice_padding: 4,
      invoice_number_format: '{PREFIX}{YYYY}-{NNNN}',
    });
    manager.query.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT next_value')) return [{ next_value: 1 }];
      if (sql.includes('FROM factures')) {
        const year = new Date().getFullYear();
        return [{ numero: `FAC-${year}-0042` }];
      }
      return [];
    });
    service = new FactureService(
      invoiceRepository as any,
      {} as any,
      {} as any,
      cabinetRepository as any,
      {} as any,
      dataSource as any,
      outbox as any,
      audit as any,
    );
  });

  it("interdit de réaffecter une facture à un autre dossier", async () => {
    jest
      .spyOn(service as any, 'findOneV1')
      .mockResolvedValue(invoice(StatutFacture.BROUILLON));

    await expect(
      service.updateFacture('invoice-1', { dossierId: 99 } as any),
    ).rejects.toThrow('immuables');
    expect(invoiceRepository.save).not.toHaveBeenCalled();
  });

  it('émet un brouillon sans produire encore d’écriture comptable', async () => {
    const facture = invoice(StatutFacture.BROUILLON);
    jest.spyOn(service as any, 'lockInvoice').mockResolvedValue(facture);

    const result = await runWithTenantContext(2, () =>
      service.issueInvoice(facture.id, { userId: 4 }),
    );

    expect(result.status).toBe(StatutFacture.ENVOYEE);
    expect(outbox.enqueue).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({ eventType: 'invoice.issued' }),
    );
    expect(outbox.enqueue).not.toHaveBeenCalledWith(
      manager,
      expect.objectContaining({ eventType: 'invoice.validated' }),
    );
  });

  it('valide uniquement une facture émise et publie l’outbox comptable', async () => {
    const facture = invoice(StatutFacture.ENVOYEE);
    jest.spyOn(service as any, 'lockInvoice').mockResolvedValue(facture);

    const result = await runWithTenantContext(2, () =>
      service.validateInvoice(facture.id, { userId: 4 }),
    );

    expect(result.status).toBe(StatutFacture.VALIDEE);
    expect(outbox.enqueue).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({
        eventType: 'invoice.validated',
        payload: expect.objectContaining({
          invoiceId: facture.id,
          montantTTC: 120,
        }),
      }),
    );
  });

  it('refuse une facture dont le TTC ne correspond pas à HT + TVA', async () => {
    const facture = invoice(StatutFacture.ENVOYEE);
    facture.montantTTC = 119.99;
    jest.spyOn(service as any, 'lockInvoice').mockResolvedValue(facture);

    await expect(
      runWithTenantContext(2, () =>
        service.validateInvoice(facture.id, { userId: 4 }),
      ),
    ).rejects.toThrow('incohérents');
    expect(invoiceRepository.save).not.toHaveBeenCalled();
  });

  it('valide un avoir et solde atomiquement la facture d’origine', async () => {
    const credit = {
      ...invoice(StatutFacture.ENVOYEE),
      id: 'credit-1',
      numero: 'AV-2026-0001',
      nature: InvoiceNature.CREDIT_NOTE,
      originalInvoiceId: 'invoice-1',
    } as Facture;
    const original = {
      ...invoice(StatutFacture.VALIDEE),
      nature: InvoiceNature.STANDARD,
      settlementDisposition: InvoiceSettlementDisposition.NONE,
    } as Facture;
    invoiceRepository.findOne.mockResolvedValue({
      id: credit.id,
      nature: InvoiceNature.CREDIT_NOTE,
    });
    jest
      .spyOn(service as any, 'lockInvoice')
      .mockResolvedValueOnce(credit)
      .mockResolvedValueOnce(original);
    manager.query.mockResolvedValue([{ total: 0 }]);

    const result = await runWithTenantContext(3, () =>
      service.validateInvoice(credit.id, { userId: 7 }),
    );

    expect(result.status).toBe(StatutFacture.VALIDEE);
    expect(original.status).toBe(StatutFacture.ANNULEE);
    expect(original.settlementDisposition).toBe(
      InvoiceSettlementDisposition.CREDITED,
    );
    expect(outbox.enqueue).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({
        eventType: 'invoice.credit_note.validated',
      }),
    );
  });

  it('qualifie et audite un abandon de la créance restante', async () => {
    const facture = {
      ...invoice(StatutFacture.PARTIELLEMENT_PAYEE),
      nature: InvoiceNature.STANDARD,
      settlementDisposition: InvoiceSettlementDisposition.NONE,
    } as Facture;
    jest.spyOn(service as any, 'lockInvoice').mockResolvedValue(facture);
    manager.query.mockResolvedValueOnce([{ total: 20 }]);
    manager.query.mockResolvedValueOnce([{ total: 0 }]);

    const result = await runWithTenantContext(3, () =>
      service.waiveInvoice(
        facture.id,
        'Abandon commercial approuvé par le responsable',
        { userId: 7 },
      ),
    );

    expect(result.status).toBe(StatutFacture.ANNULEE);
    expect(result.settlementDisposition).toBe(
      InvoiceSettlementDisposition.WAIVED,
    );
    expect(outbox.enqueue).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({
        eventType: 'invoice.waived',
        payload: expect.objectContaining({ remainingAmount: 100 }),
      }),
    );
  });

  it('refuse l’annulation directe dès qu’un paiement est validé', async () => {
    const facture = invoice(StatutFacture.VALIDEE);
    jest.spyOn(service as any, 'lockInvoice').mockResolvedValue(facture);
    paymentRepository.count.mockResolvedValue(1);

    await expect(
      runWithTenantContext(2, () =>
        service.cancelInvoice(
          facture.id,
          'Annulation justifiée par une erreur matérielle',
          { userId: 4 },
        ),
      ),
    ).rejects.toThrow('encaissée');
    expect(invoiceRepository.save).not.toHaveBeenCalled();
  });

  it('interdit le changement générique de statut', async () => {
    await expect(
      service.changerStatutFacture('invoice-1', String(StatutFacture.PAYEE)),
    ).rejects.toThrow('générique');
  });

  it('conserve le statut antérieur dans l’événement d’annulation', async () => {
    const facture = invoice(StatutFacture.BROUILLON);
    jest.spyOn(service as any, 'lockInvoice').mockResolvedValue(facture);

    const result = await runWithTenantContext(2, () =>
      service.cancelInvoice(
        facture.id,
        'Annulation justifiée par une erreur matérielle',
        { userId: 4 },
      ),
    );

    expect(result.status).toBe(StatutFacture.ANNULEE);
    expect(outbox.enqueue).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({
        eventType: 'invoice.cancelled',
        payload: expect.objectContaining({
          previousStatus: StatutFacture.BROUILLON,
        }),
      }),
    );
  });

  it('interdit la suppression physique', async () => {
    await expect(service.removeInvoice()).rejects.toThrow('suppression');
  });

  it('réserve le numéro suivant sous verrou et reprend les données existantes', async () => {
    const year = new Date().getFullYear();
    const numero = await runWithTenantContext(2, () =>
      service.generateFacNumber(),
    );

    expect(numero).toBe(`FAC-${year}-0043`);
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('FOR UPDATE'),
      expect.any(Array),
    );
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('SET next_value = ?'),
      expect.arrayContaining([44, 2]),
    );
  });
});
