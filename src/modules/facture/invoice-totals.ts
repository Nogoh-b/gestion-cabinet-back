import { StatutPaiement } from '../paiement/dto/create-paiement.dto';
import { StatutFacture, TypeFacture } from './dto/create-facture.dto';

/**
 * Règle unique des totaux de factures (fiche dossier, export, chat IA) :
 * - une facture ANNULÉE est listée mais sort de tous les totaux ;
 * - un BROUILLON est compté, et signalé à part ;
 * - un AVOIR (type 4, TTC négatif) vient en déduction ;
 * - « payé » = paiements VALIDÉS seulement, jamais le statut de la facture.
 */

export interface PaymentLike {
  montant?: number | string | null;
  status?: number | string | null;
  deleted_at?: Date | string | null;
}

export interface InvoiceLike {
  id?: string;
  numero?: string | null;
  libelle?: string | null;
  type?: number | string | null;
  status?: number | string | null;
  montantTTC?: number | string | null;
  dateFacture?: Date | string | null;
  dateEcheance?: Date | string | null;
  /** `undefined` = paiements non chargés (repli sur le statut, cf. invoicePaid). */
  paiements?: PaymentLike[] | null;
}

export interface InvoiceTotalsLine {
  id?: string;
  numero: string;
  date: Date | string | null;
  echeance: Date | string | null;
  ttc: number;
  paid: number;
  remaining: number;
  status: number;
  statusLabel: string;
  cancelled: boolean;
  draft: boolean;
  credit: boolean;
}

export interface InvoiceTotals {
  /** Toutes les factures, annulées comprises. */
  count: number;
  cancelled: { count: number; amount: number };
  drafts: { count: number; amount: number };
  credits: { count: number; amount: number };
  /** TTC hors annulées (brouillons et avoirs compris). */
  total: number;
  /** Paiements validés des factures non annulées. */
  paid: number;
  /** total − payé, jamais négatif. */
  remaining: number;
  lines: InvoiceTotalsLine[];
}

const STATUS_LABELS: Record<number, string> = {
  [StatutFacture.BROUILLON]: 'Brouillon',
  [StatutFacture.ENVOYEE]: 'Envoyée',
  [StatutFacture.PARTIELLEMENT_PAYEE]: 'Partiellement payée',
  [StatutFacture.PAYEE]: 'Payée',
  [StatutFacture.IMPAYEE]: 'Impayée',
  [StatutFacture.ANNULEE]: 'Annulée',
};

const round = (value: number) => Math.round(value * 100) / 100;
const amount = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export function invoiceStatusLabel(status: unknown): string {
  return STATUS_LABELS[Number(status)] ?? 'Inconnu';
}

export function isCancelledInvoice(invoice: InvoiceLike): boolean {
  return Number(invoice.status) === StatutFacture.ANNULEE;
}

export function isDraftInvoice(invoice: InvoiceLike): boolean {
  return Number(invoice.status) === StatutFacture.BROUILLON;
}

export function isCreditNote(invoice: InvoiceLike): boolean {
  return Number(invoice.type) === TypeFacture.AVOIR;
}

/** Somme des paiements validés et non supprimés. */
export function validatedPayments(paiements: PaymentLike[] | null | undefined): number {
  return round(
    (paiements ?? [])
      .filter((p) => !p.deleted_at && Number(p.status) === StatutPaiement.VALIDE)
      .reduce((sum, p) => sum + amount(p.montant), 0),
  );
}

/**
 * Payé d'une facture. Sans paiements chargés (listes), le statut PAYÉE vaut
 * le TTC : c'est la seule information disponible.
 */
export function invoicePaid(invoice: InvoiceLike, paidById?: Map<string, number>): number {
  if (isCancelledInvoice(invoice)) return 0;
  if (paidById && invoice.id && paidById.has(invoice.id)) return paidById.get(invoice.id)!;
  if (Array.isArray(invoice.paiements)) return validatedPayments(invoice.paiements);
  if (paidById) return 0;
  return Number(invoice.status) === StatutFacture.PAYEE ? amount(invoice.montantTTC) : 0;
}

export function summarizeInvoices(
  invoices: InvoiceLike[] | null | undefined,
  paidById?: Map<string, number>,
): InvoiceTotals {
  const totals: InvoiceTotals = {
    count: 0,
    cancelled: { count: 0, amount: 0 },
    drafts: { count: 0, amount: 0 },
    credits: { count: 0, amount: 0 },
    total: 0,
    paid: 0,
    remaining: 0,
    lines: [],
  };
  for (const invoice of invoices ?? []) {
    const ttc = amount(invoice.montantTTC);
    const cancelled = isCancelledInvoice(invoice);
    const draft = isDraftInvoice(invoice);
    const credit = isCreditNote(invoice);
    const paid = invoicePaid(invoice, paidById);
    totals.count += 1;
    if (cancelled) {
      totals.cancelled.count += 1;
      totals.cancelled.amount += ttc;
    } else {
      totals.total += ttc;
      totals.paid += paid;
      if (draft) {
        totals.drafts.count += 1;
        totals.drafts.amount += ttc;
      }
      if (credit) {
        totals.credits.count += 1;
        totals.credits.amount += ttc;
      }
    }
    totals.lines.push({
      id: invoice.id,
      numero: invoice.numero || invoice.libelle || '',
      date: invoice.dateFacture ?? null,
      echeance: invoice.dateEcheance ?? null,
      ttc: round(ttc),
      paid: round(paid),
      remaining: cancelled ? 0 : round(Math.max(ttc - paid, credit ? ttc : 0)),
      status: Number(invoice.status),
      statusLabel: invoiceStatusLabel(invoice.status),
      cancelled,
      draft,
      credit,
    });
  }
  totals.cancelled.amount = round(totals.cancelled.amount);
  totals.drafts.amount = round(totals.drafts.amount);
  totals.credits.amount = round(totals.credits.amount);
  totals.total = round(totals.total);
  totals.paid = round(totals.paid);
  totals.remaining = round(Math.max(totals.total - totals.paid, 0));
  return totals;
}
