import { describe, expect, it } from '@jest/globals';
import { summarizeInvoices } from './invoice-totals';

const paid = (...amounts: number[]) =>
  amounts.map((montant) => ({ montant: String(montant), status: '1' }));

/** DOS-2026-0037 tel qu'en base le 21/10/2026 (cabinet 22). */
const DOSSIER_0037 = [
  { id: 'a', numero: 'FAC-2026-0032', type: '0', status: '3', montantTTC: '25000.00', paiements: paid(10000, 15000) },
  { id: 'b', numero: 'FAC-2026-0033', type: '0', status: '0', montantTTC: '75000.00', paiements: [] },
  { id: 'c', numero: 'FAC-2026-0034', type: '0', status: '3', montantTTC: '15000.00', paiements: paid(5000, 10000) },
  { id: 'd', numero: 'FAC-2026-0035', type: '0', status: '0', montantTTC: '50000.00', paiements: [] },
  { id: 'e', numero: 'FAC-2026-0037', type: '0', status: '2', montantTTC: '54500.00', paiements: paid(25000) },
  { id: 'f', numero: 'FAC-2026-0038', type: '0', status: '5', montantTTC: '20000.00', paiements: [] },
  { id: 'g', numero: 'FAC-2026-0039', type: '0', status: '0', montantTTC: '292200.00', paiements: [] },
  { id: 'h', numero: 'FAC-2026-0040', type: '0', status: '2', montantTTC: '3228.00', paiements: paid(1000) },
];

describe('summarizeInvoices', () => {
  it('exclut la facture annulée, compte les acomptes et signale les brouillons', () => {
    const totals = summarizeInvoices(DOSSIER_0037);

    expect(totals.count).toBe(8);
    expect(totals.cancelled).toEqual({ count: 1, amount: 20000 });
    expect(totals.total).toBe(514928);
    expect(totals.paid).toBe(66000);
    expect(totals.remaining).toBe(448928);
    expect(totals.drafts).toEqual({ count: 3, amount: 417200 });
    const cancelled = totals.lines.find((line) => line.numero === 'FAC-2026-0038');
    expect(cancelled).toMatchObject({ cancelled: true, remaining: 0, statusLabel: 'Annulée' });
  });

  it('ignore les paiements non validés ou supprimés', () => {
    const totals = summarizeInvoices([
      {
        id: 'x',
        status: '1',
        montantTTC: 1000,
        paiements: [
          { montant: 300, status: '1' },
          { montant: 200, status: '0' },
          { montant: 100, status: '1', deleted_at: new Date() },
        ],
      },
    ]);
    expect(totals.paid).toBe(300);
    expect(totals.remaining).toBe(700);
  });

  it("déduit un avoir et n'en fait pas un reste à payer", () => {
    const totals = summarizeInvoices([
      { id: 'x', type: 0, status: 1, montantTTC: 10000, paiements: [] },
      { id: 'y', type: 4, status: 1, montantTTC: -4000, paiements: [] },
    ]);
    expect(totals.total).toBe(6000);
    expect(totals.credits).toEqual({ count: 1, amount: -4000 });
    expect(totals.remaining).toBe(6000);
  });

  it('sans paiements chargés, se replie sur le statut payée', () => {
    const totals = summarizeInvoices([
      { id: 'x', status: 3, montantTTC: 500 },
      { id: 'y', status: 1, montantTTC: 700 },
    ]);
    expect(totals.paid).toBe(500);
  });

  it('préfère les sommes fournies par facture', () => {
    const totals = summarizeInvoices(
      [{ id: 'x', status: 3, montantTTC: 500 }],
      new Map([['x', 120]]),
    );
    expect(totals.paid).toBe(120);
  });
});
