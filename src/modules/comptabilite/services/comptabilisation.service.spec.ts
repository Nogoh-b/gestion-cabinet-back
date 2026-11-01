import { ComptabilisationService } from './comptabilisation.service';

describe('ComptabilisationService - contrepassation de facture', () => {
  const ecritures = {
    creer: jest.fn(),
    existeParSource: jest.fn(),
  };
  let service: ComptabilisationService;

  beforeEach(() => {
    jest.clearAllMocks();
    ecritures.creer.mockResolvedValue({ id: 'entry-reversal' });
    service = new ComptabilisationService(ecritures as any);
  });

  it('utilise une source et une clé d’idempotence distinctes de l’écriture originale', async () => {
    await service.extournerFacture({
      id: 'invoice-1',
      numero: 'FAC-2026-0001',
      montantHT: 100,
      montantTVA: 20,
    });

    expect(ecritures.creer).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceId: 'reversal:invoice-1',
        idempotencyKey: 'invoice-reversal:invoice-1',
      }),
      true,
    );
  });

  it('comptabilise un avoir en diminution des honoraires, de la TVA et du client', async () => {
    await service.comptabiliserAvoir({
      id: 'credit-1',
      numero: 'AV-2026-0001',
      originalInvoiceId: 'invoice-1',
      originalInvoiceNumber: 'FAC-2026-0001',
      dateFacture: '2026-07-29',
      montantHT: 100,
      montantTVA: 20,
      montantTTC: 120,
    });

    expect(ecritures.creer).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceId: 'credit-note:credit-1',
        idempotencyKey: 'credit-note:credit-1',
        lignes: [
          expect.objectContaining({
            numeroCompte: '706',
            debit: 100,
            credit: 0,
          }),
          expect.objectContaining({
            numeroCompte: '445',
            debit: 20,
            credit: 0,
          }),
          expect.objectContaining({
            numeroCompte: '411',
            debit: 0,
            credit: 120,
          }),
        ],
      }),
      true,
    );
  });

  it('comptabilise un abandon commercial au prorata HT et TVA', async () => {
    await service.comptabiliserAbandonCreance({
      invoiceId: 'invoice-1',
      numero: 'FAC-2026-0001',
      montantHT: 100,
      montantTTC: 120,
      remainingAmount: 60,
      badDebt: false,
    });

    expect(ecritures.creer).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceId: 'waiver:invoice-1',
        idempotencyKey: 'waiver:invoice-1',
        lignes: [
          expect.objectContaining({
            numeroCompte: '706',
            debit: 50,
          }),
          expect.objectContaining({
            numeroCompte: '445',
            debit: 10,
          }),
          expect.objectContaining({
            numeroCompte: '411',
            credit: 60,
          }),
        ],
      }),
      true,
    );
  });

  it('isole la perte sur créance irrécouvrable dans une écriture dédiée', async () => {
    await service.comptabiliserAbandonCreance({
      invoiceId: 'invoice-1',
      numero: 'FAC-2026-0001',
      remainingAmount: 80,
      badDebt: true,
    });

    expect(ecritures.creer).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceId: 'bad-debt:invoice-1',
        idempotencyKey: 'bad-debt:invoice-1',
        lignes: [
          expect.objectContaining({
            numeroCompte: '671',
            debit: 80,
          }),
          expect.objectContaining({
            numeroCompte: '411',
            credit: 80,
          }),
        ],
      }),
      true,
    );
  });
});
