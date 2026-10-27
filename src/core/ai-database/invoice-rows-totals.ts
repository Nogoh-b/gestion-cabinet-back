import { summarizeInvoices } from 'src/modules/facture/invoice-totals';

/**
 * Lignes SQL de factures (lecture) → totaux calculés en code. Sans eux, le
 * modèle additionnait lui-même les montants, facture annulée comprise
 * (« 8 factures, 554 928 FCFA » au lieu de 514 928).
 */

const TTC_KEYS = ['montant_ttc', 'montantttc', 'total_ttc', 'montant ttc'];
const STATUS_KEYS = ['statut', 'status', 'statut_facture', 'facture_status', 'etat'];
const PAID_KEYS = ['montant_paye', 'montantpaye', 'total_paye', 'deja_paye', 'paye', 'montant_regle', 'encaisse', 'total_encaisse', 'paid', 'amount_paid'];
const ID_KEYS = ['ref__factures', 'numero', 'facture_numero', 'numero_facture', 'id'];

const STATUS_CODES: Record<string, number> = {
  brouillon: 0,
  envoyee: 1,
  'partiellement payee': 2,
  payee: 3,
  impayee: 4,
  annulee: 5,
};

const normalize = (value: unknown) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/_/g, ' ')
    .trim();

function pick(row: Record<string, unknown>, keys: string[]): string | undefined {
  const byName = new Map(Object.keys(row).map((key) => [normalize(key).replace(/ /g, '_'), key]));
  for (const key of keys) {
    const found = byName.get(key.replace(/ /g, '_'));
    if (found !== undefined) return found;
  }
  return undefined;
}

function statusCode(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  if (Number.isInteger(numeric) && numeric >= 0 && numeric <= 5) return numeric;
  const code = STATUS_CODES[normalize(value)];
  return code ?? null;
}

const money = (value: number) =>
  `${value.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} FCFA`;

/** Bloc à ajouter au prompt de réponse, ou '' si les lignes ne sont pas des factures. */
export function invoiceRowsTotalsBlock(rows: unknown): string {
  if (!Array.isArray(rows) || rows.length < 2) return '';
  const first = rows[0] as Record<string, unknown>;
  if (!first || typeof first !== 'object') return '';
  const ttcKey = pick(first, TTC_KEYS);
  // `status` (code) et `statut` (libellé) peuvent coexister : le premier lisible.
  const statusKey = STATUS_KEYS
    .map((key) => pick(first, [key]))
    .find((key) => key !== undefined && statusCode(first[key]) !== null);
  // Sans statut, impossible d'écarter une facture annulée : pas de total trompeur.
  if (!ttcKey || !statusKey) return '';
  const paidKey = pick(first, PAID_KEYS);
  const idKey = pick(first, ID_KEYS);

  const seen = new Set<string>();
  const invoices: Array<{ id: string; status: number | null; montantTTC: string | number; paid: number }> = [];
  for (const row of rows as Array<Record<string, unknown>>) {
    const id = idKey ? String(row[idKey] ?? '') : '';
    if (id && seen.has(id)) continue;
    if (id) seen.add(id);
    invoices.push({
      id: id || String(invoices.length),
      status: statusCode(row[statusKey]),
      montantTTC: Number(row[ttcKey]) || 0,
      paid: paidKey ? Number(row[paidKey]) || 0 : 0,
    });
  }
  const paidById = paidKey ? new Map(invoices.map((invoice) => [invoice.id, invoice.paid])) : undefined;
  const totals = summarizeInvoices(
    invoices.map((invoice) => ({ id: invoice.id, status: invoice.status ?? undefined, montantTTC: invoice.montantTTC })),
    paidById,
  );
  const parts = [
    `${totals.count} facture(s) listée(s)`,
    `total TTC hors annulées ${money(totals.total)}`,
    totals.drafts.count ? `dont ${totals.drafts.count} brouillon(s) pour ${money(totals.drafts.amount)}` : '',
    paidKey ? `encaissé ${money(totals.paid)}` : '',
    paidKey ? `reste à encaisser ${money(totals.remaining)}` : '',
    totals.cancelled.count
      ? `${totals.cancelled.count} facture(s) annulée(s) pour ${money(totals.cancelled.amount)} : à citer avec la mention « annulée », exclue(s) de tous les totaux`
      : '',
  ].filter(Boolean);
  return `
TOTAUX CALCULÉS PAR L'APPLICATION SUR CES FACTURES (à reprendre tels quels, ne refais aucune addition) :
- ${parts.join(' ; ')}.
`;
}
