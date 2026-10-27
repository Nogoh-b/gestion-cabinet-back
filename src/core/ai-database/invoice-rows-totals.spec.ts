import { describe, expect, it } from '@jest/globals';
import { invoiceRowsTotalsBlock } from './invoice-rows-totals';

// « liste les factures du dossier » (DOS-2026-0037) : lignes telles que les
// renvoie la requête de lecture, statut lisible et montant payé compris.
const ROWS = [
  { numero: 'FAC-2026-0032', montant_ttc: '25000.00', montant_paye: '25000.00', statut: 'Payee' },
  { numero: 'FAC-2026-0033', montant_ttc: '75000.00', montant_paye: '0', statut: 'Brouillon' },
  { numero: 'FAC-2026-0034', montant_ttc: '15000.00', montant_paye: '15000.00', statut: 'Payee' },
  { numero: 'FAC-2026-0035', montant_ttc: '50000.00', montant_paye: '0', statut: 'Brouillon' },
  { numero: 'FAC-2026-0037', montant_ttc: '54500.00', montant_paye: '25000.00', statut: 'Partiellement payee' },
  { numero: 'FAC-2026-0038', montant_ttc: '20000.00', montant_paye: '0', statut: 'Annulee' },
  { numero: 'FAC-2026-0039', montant_ttc: '292200.00', montant_paye: '0', statut: 'Brouillon' },
  { numero: 'FAC-2026-0040', montant_ttc: '3228.00', montant_paye: '1000.00', statut: 'Partiellement payee' },
];

const flat = (text: string) => text.replace(/\s/g, ' ');

describe('invoiceRowsTotalsBlock', () => {
  it('totalise hors annulée, signale brouillons et annulée', () => {
    const block = flat(invoiceRowsTotalsBlock(ROWS));
    expect(block).toContain('8 facture(s) listée(s)');
    expect(block).toContain('total TTC hors annulées 514 928 FCFA');
    expect(block).toContain('dont 3 brouillon(s) pour 417 200 FCFA');
    expect(block).toContain('encaissé 66 000 FCFA');
    expect(block).toContain('reste à encaisser 448 928 FCFA');
    expect(block).toContain('1 facture(s) annulée(s) pour 20 000 FCFA');
  });

  it('comprend les codes de statut numériques', () => {
    const rows = ROWS.map((row) => ({ ...row, statut: undefined, status: row.statut === 'Annulee' ? '5' : '1' }));
    expect(flat(invoiceRowsTotalsBlock(rows))).toContain('total TTC hors annulées 514 928 FCFA');
  });

  it('dédoublonne une facture répétée par une jointure', () => {
    const block = flat(invoiceRowsTotalsBlock([ROWS[0], ROWS[0], ROWS[4]]));
    expect(block).toContain('2 facture(s) listée(s)');
  });

  it("ne dit rien quand ce ne sont pas des factures ou qu'il manque le statut", () => {
    expect(invoiceRowsTotalsBlock([{ dossier_number: 'A' }, { dossier_number: 'B' }])).toBe('');
    expect(invoiceRowsTotalsBlock(ROWS.map(({ statut, ...row }) => row))).toBe('');
    expect(invoiceRowsTotalsBlock([ROWS[0]])).toBe('');
  });
});
