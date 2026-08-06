import { StatutFacture } from '../../facture/dto/create-facture.dto';
import { ComptabiliteEventBridge } from './comptabilite-event.bridge';

describe('ComptabiliteEventBridge - événements durables', () => {
  const comptabilisation = {
    extournerFacture: jest.fn(),
    comptabiliserAvoir: jest.fn(),
    comptabiliserAbandonCreance: jest.fn(),
    comptabiliserPaie: jest.fn(),
    comptabiliserPaiementPaie: jest.fn(),
    comptabiliserCommission: jest.fn(),
  };
  let bridge: ComptabiliteEventBridge;

  beforeEach(() => {
    jest.clearAllMocks();
    bridge = new ComptabiliteEventBridge(comptabilisation as any);
  });

  it('ignore l’annulation d’une facture non validée', async () => {
    await bridge.onInvoiceCancelled({
      invoiceId: 'invoice-1',
      previousStatus: StatutFacture.BROUILLON,
    });

    expect(comptabilisation.extournerFacture).not.toHaveBeenCalled();
  });

  it('contrepasse une facture validée', async () => {
    comptabilisation.extournerFacture.mockResolvedValue({});

    await bridge.onInvoiceCancelled({
      invoiceId: 'invoice-1',
      previousStatus: StatutFacture.VALIDEE,
      numero: 'FAC-2026-0001',
      montantHT: 100,
      montantTVA: 20,
      montantTTC: 120,
    });

    expect(comptabilisation.extournerFacture).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'invoice-1',
        numero: 'FAC-2026-0001',
      }),
    );
  });

  it('route la validation d’un avoir avec sa facture d’origine', async () => {
    await bridge.onCreditNoteValidated({
      invoiceId: 'credit-1',
      numero: 'AV-2026-0001',
      originalInvoiceId: 'invoice-1',
      originalInvoiceNumber: 'FAC-2026-0001',
      montantHT: 100,
      montantTVA: 20,
      montantTTC: 120,
    });

    expect(comptabilisation.comptabiliserAvoir).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'credit-1',
        originalInvoiceId: 'invoice-1',
        originalInvoiceNumber: 'FAC-2026-0001',
      }),
    );
  });

  it.each([
    ['waived', false],
    ['badDebt', true],
  ])(
    'qualifie correctement la disposition %s',
    async (kind, badDebt) => {
      const payload = {
        invoiceId: 'invoice-1',
        numero: 'FAC-2026-0001',
        remainingAmount: 80,
      };

      if (kind === 'waived') {
        await bridge.onInvoiceWaived(payload);
      } else {
        await bridge.onInvoiceBadDebt(payload);
      }

      expect(
        comptabilisation.comptabiliserAbandonCreance,
      ).toHaveBeenCalledWith({
        ...payload,
        badDebt,
      });
    },
  );

  it('comptabilise la paie puis le règlement du net', async () => {
    await bridge.onPayslipPaid({
      payslipId: 15,
      employeeId: 4,
      employeeName: 'Salarié Test',
      periodId: 7,
      periodLabel: 'Juillet 2026',
      grossAmount: 500000,
      netAmount: 420000,
      totalEmployerCharges: 50000,
      paymentDate: '2026-07-28T10:00:00.000Z',
      paymentMethod: 'bank_transfer',
      paymentReference: 'VIR-PAIE-15',
      lines: [
        {
          lineType: 'advance_recovery',
          label: 'Récupération avance',
          amount: 20000,
        },
      ],
    });

    expect(comptabilisation.comptabiliserPaie).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 15,
        gross_amount: 500000,
        lines: [
          expect.objectContaining({
            line_type: 'advance_recovery',
          }),
        ],
      }),
    );
    expect(
      comptabilisation.comptabiliserPaiementPaie,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 15,
        payment_reference: 'VIR-PAIE-15',
      }),
    );
  });

  it('comptabilise une commission payée depuis l’outbox', async () => {
    await bridge.onReferralCommissionPaid({
      commissionId: 31,
      dossierReferralId: 8,
      invoiceId: 'invoice-1',
      sourcePaymentId: 'payment-1',
      referrerName: 'Apporteur Test',
      amount: 250000,
      paymentDate: '2026-01-20T10:00:00.000Z',
      paymentMethod: 'mobile_money',
      paymentReference: 'MM-COM-002',
    });

    expect(
      comptabilisation.comptabiliserCommission,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 31,
        amount: 250000,
        payment_reference: 'MM-COM-002',
        referrer_name: 'Apporteur Test',
      }),
    );
  });
});
