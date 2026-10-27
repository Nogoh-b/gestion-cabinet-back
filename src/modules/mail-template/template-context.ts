// src/modules/mail-template/template-context.ts
//
// Listes et totaux des modèles (mails et PDF) : factures, paiements,
// audiences, actions, diligences et pièces d'un dossier, dossiers et
// factures d'un client, paiements d'une facture. Valeurs déjà mises en forme
// (dates et montants à la française), parcourues avec `{{#each dossier.factures}}`.
//
// Fonctions pures : le chargement (et les droits) est dans TemplateContextService.

import { summarizeInvoices, type InvoiceLike } from '../facture/invoice-totals';
import {
  DOSSIER_ACTION_PRIORITY_LABELS,
  DOSSIER_ACTION_STATUS_LABELS,
  DOSSIER_STATUS_LABELS,
} from './mail-variables';

/** Entités dont un modèle peut être rempli. */
export const TEMPLATE_ENTITY_TYPES = ['dossier', 'client', 'facture', 'paiement', 'audience', 'diligence', 'document', 'action'] as const;
export type TemplateEntityType = (typeof TEMPLATE_ENTITY_TYPES)[number];

export type TemplateRow = Record<string, string>;

/**
 * Catalogue des listes (miroir de `app/lib/template-lists.ts` côté front) :
 * colonnes de chaque ligne, fiches qui y ont accès (via leur dossier, leur
 * client ou la facture).
 */
export interface TemplateListDef {
  key: string;
  label: string;
  fields: Array<{ key: string; label: string }>;
  entities: readonly string[];
}

const DOSSIER_SCOPED = ['dossier', 'facture', 'paiement', 'audience', 'diligence', 'document', 'action', 'general'] as const;
const INVOICE_FIELDS = [
  { key: 'numero', label: 'N°' }, { key: 'date', label: 'Date' }, { key: 'echeance', label: 'Échéance' },
  { key: 'montant_ttc', label: 'Montant TTC' }, { key: 'montant_paye', label: 'Payé' }, { key: 'reste_a_payer', label: 'Reste à payer' },
  { key: 'statut', label: 'Statut' }, { key: 'en_retard', label: 'En retard' },
];
const PAYMENT_FIELDS = [
  { key: 'date', label: 'Date' }, { key: 'montant', label: 'Montant' }, { key: 'mode', label: 'Mode' },
  { key: 'facture', label: 'Facture' }, { key: 'reference', label: 'Référence' }, { key: 'statut', label: 'Statut' },
];

export const TEMPLATE_LISTS: TemplateListDef[] = [
  { key: 'dossier.factures', label: 'Factures du dossier', fields: INVOICE_FIELDS, entities: DOSSIER_SCOPED },
  { key: 'dossier.paiements', label: 'Paiements du dossier', fields: PAYMENT_FIELDS, entities: DOSSIER_SCOPED },
  {
    key: 'dossier.audiences', label: 'Audiences du dossier', entities: DOSSIER_SCOPED,
    fields: [
      { key: 'date', label: 'Date' }, { key: 'heure', label: 'Heure' }, { key: 'juridiction', label: 'Juridiction' },
      { key: 'salle', label: 'Salle' }, { key: 'juge', label: 'Juge' }, { key: 'type', label: 'Type' },
      { key: 'statut', label: 'Statut' }, { key: 'decision', label: 'Décision' }, { key: 'renvoi', label: 'Renvoyée au' },
    ],
  },
  {
    key: 'dossier.actions', label: 'Actions du dossier', entities: DOSSIER_SCOPED,
    fields: [
      { key: 'titre', label: 'Action' }, { key: 'statut', label: 'Statut' }, { key: 'priorite', label: 'Priorité' },
      { key: 'echeance', label: 'Échéance' }, { key: 'terminee_le', label: 'Terminée le' },
      { key: 'responsable', label: 'Responsable' }, { key: 'resultat', label: 'Résultat' },
    ],
  },
  {
    key: 'dossier.diligences', label: 'Diligences du dossier', entities: DOSSIER_SCOPED,
    fields: [
      { key: 'titre', label: 'Diligence' }, { key: 'type', label: 'Type' }, { key: 'statut', label: 'Statut' },
      { key: 'date_limite', label: 'Date limite' }, { key: 'avocat', label: 'Avocat' },
    ],
  },
  {
    key: 'dossier.documents', label: 'Pièces du dossier', entities: DOSSIER_SCOPED,
    fields: [{ key: 'nom', label: 'Pièce' }, { key: 'type', label: 'Type' }, { key: 'date', label: 'Date' }],
  },
  {
    key: 'client.dossiers', label: 'Dossiers du client', entities: ['client'],
    fields: [
      { key: 'numero', label: 'N°' }, { key: 'objet', label: 'Objet' }, { key: 'statut', label: 'Statut' },
      { key: 'date_ouverture', label: 'Ouvert le' },
    ],
  },
  { key: 'client.factures', label: 'Factures du client', fields: INVOICE_FIELDS, entities: ['client'] },
  { key: 'facture.paiements', label: 'Paiements de la facture', fields: PAYMENT_FIELDS, entities: ['facture'] },
];

/** Totaux et compteurs (texte simple, à côté des listes). */
export const TEMPLATE_TOTALS: Array<{ key: string; label: string; entities: readonly string[] }> = [
  { key: 'dossier.total_facture', label: 'Total facturé du dossier', entities: DOSSIER_SCOPED },
  { key: 'dossier.total_encaisse', label: 'Total encaissé du dossier', entities: DOSSIER_SCOPED },
  { key: 'dossier.total_reste', label: 'Reste à encaisser du dossier', entities: DOSSIER_SCOPED },
  { key: 'dossier.nb_factures', label: 'Nombre de factures', entities: DOSSIER_SCOPED },
  { key: 'dossier.nb_audiences', label: "Nombre d'audiences", entities: DOSSIER_SCOPED },
  { key: 'dossier.nb_actions', label: "Nombre d'actions", entities: DOSSIER_SCOPED },
  { key: 'dossier.nb_diligences', label: 'Nombre de diligences', entities: DOSSIER_SCOPED },
  { key: 'dossier.nb_documents', label: 'Nombre de pièces', entities: DOSSIER_SCOPED },
  { key: 'client.nb_dossiers', label: 'Nombre de dossiers du client', entities: ['client'] },
  { key: 'client.nb_factures', label: 'Nombre de factures du client', entities: ['client'] },
  { key: 'client.total_facture', label: 'Total facturé au client', entities: ['client'] },
  { key: 'client.total_encaisse', label: 'Total encaissé du client', entities: ['client'] },
  { key: 'client.total_reste', label: 'Reste à encaisser du client', entities: ['client'] },
];

/** Groupe « Listes et totaux » du catalogue des variables (éditeur des modèles). */
export const TEMPLATE_LIST_GROUP = {
  namespace: 'listes',
  label: 'Listes et totaux',
  variables: [
    ...TEMPLATE_LISTS.map((list) => ({ key: list.key, label: `${list.label} (tableau)` })),
    ...TEMPLATE_TOTALS.map((total) => ({ key: total.key, label: total.label })),
  ],
};

/**
 * Clés des listes, de leurs colonnes (`dossier.factures.numero`, chemin lu
 * dans un `{{#each}}`) et des totaux ; celles d'une fiche si `entityType`.
 */
export function templateListKeys(entityType?: string): string[] {
  const fits = (entities: readonly string[]) => !entityType || entities.includes(entityType);
  return [
    ...TEMPLATE_LISTS.filter((list) => fits(list.entities)).flatMap((list) => [list.key, ...list.fields.map((field) => `${list.key}.${field.key}`)]),
    ...TEMPLATE_TOTALS.filter((total) => fits(total.entities)).map((total) => total.key),
  ];
}

const EACH_OPEN = /\{\{\s*#each\s+[\w.]+\s*\}\}/;
const EACH_CLOSE = /\{\{\s*\/each\s*\}\}/;

/**
 * Ligne de tableau répétée (miroir de `hoistLoops` côté front) : l'éditeur ne
 * met du texte que dans les cellules, `{{#each liste}}` est donc écrit dans la
 * première et `{{/each}}` dans la dernière. Ces repères sont déplacés autour
 * de la ligne entière (`<tr>`), ou de la puce (`<li>`) qu'ils encadrent en
 * entier ; une boucle dans une seule cellule reste en place.
 */
export function hoistLoops(html: string): string {
  return String(html ?? '').replace(/<(tr|li)\b[^>]*>(?:(?!<\1\b)[\s\S])*?<\/\1>/gi, (row: string, tag: string) => {
    const open = EACH_OPEN.exec(row);
    if (!open) return row;
    const rest = row.slice(open.index + open[0].length);
    const close = EACH_CLOSE.exec(rest);
    if (!close || EACH_OPEN.test(rest.slice(0, close.index))) return row;
    const before = row.slice(0, open.index);
    const after = rest.slice(close.index + close[0].length);
    const plain = (part: string) => !part.replace(/<[^>]*>/g, '').trim();
    const spansCells = /<\/t[dh]>/i.test(rest.slice(0, close.index));
    const wholeItem = tag.toLowerCase() === 'li' && plain(before) && plain(after);
    if (!spansCells && !wholeItem) return row;
    return `${open[0]}${before}${rest.slice(0, close.index)}${after}{{/each}}`;
  });
}

/** Le modèle utilise une liste ou un total (le contexte n'est chargé qu'alors pour un mail). */
export const TEMPLATE_LIST_REFERENCE =
  /\b(?:dossier\.(?:factures|paiements|audiences|actions|diligences|documents|nb_\w+|total_\w+)|client\.(?:dossiers|factures|nb_\w+|total_\w+)|facture\.paiements)\b/;

const AUDIENCE_STATUS_LABELS: Record<string, string> = { 0: 'Programmée', 1: 'Tenue', 2: 'Renvoyée', 3: 'Annulée' };
const DILIGENCE_STATUS_LABELS: Record<string, string> = {
  draft: 'À faire', in_progress: 'En cours', review: 'En relecture', completed: 'Terminée', cancelled: 'Annulée',
};
const PAYMENT_STATUS_LABELS: Record<string, string> = { 0: 'En attente de validation', 1: 'Validé', 2: 'Rejeté', 3: 'Annulé' };
const PAYMENT_MODE_LABELS: Record<string, string> = {
  0: 'Virement', 1: 'Chèque', 2: 'Espèces', 3: 'Carte', 4: 'Prélèvement', 5: 'Mobile money', 6: 'Autre',
};

/** Lignes au plus par liste (un modèle reste lisible). */
export const TEMPLATE_LIST_MAX = 100;

const text = (value: unknown): string => (value === null || value === undefined ? '' : String(value).trim());

export function dateFr(value: unknown): string {
  if (!value) return '';
  const date = new Date(value as any);
  return Number.isNaN(date.getTime()) ? text(value) : date.toLocaleDateString('fr-FR');
}

/** Montant à la française, sans devise (le modèle l'écrit). */
export function amountFr(value: unknown): string {
  const number = Number(value ?? 0);
  return (Number.isFinite(number) ? number : 0).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

const timeOf = (value: unknown) => {
  const time = new Date(value as any).getTime();
  return Number.isFinite(time) ? time : 0;
};

/** Plus ancien d'abord ; sans date, à la fin. */
const chronological = <T>(items: T[], dateOf: (item: T) => unknown) =>
  [...items].sort((a, b) => (timeOf(dateOf(a)) || Number.MAX_SAFE_INTEGER) - (timeOf(dateOf(b)) || Number.MAX_SAFE_INTEGER));

const startOfToday = () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today.getTime();
};

const userName = (user: any) =>
  text(user?.full_name) || [text(user?.first_name), text(user?.last_name)].filter(Boolean).join(' ') || text(user?.username);

/** Factures (paiements chargés) : lignes et totaux, selon la règle commune (annulées hors totaux). */
export function invoiceRows(invoices: InvoiceLike[]): { rows: TemplateRow[]; totals: TemplateRow } {
  const summary = summarizeInvoices(invoices);
  const today = startOfToday();
  const rows = chronological(summary.lines, (line) => line.date).slice(0, TEMPLATE_LIST_MAX).map((line) => ({
    numero: text(line.numero),
    date: dateFr(line.date),
    echeance: dateFr(line.echeance),
    montant_ttc: amountFr(line.ttc),
    montant_paye: amountFr(line.paid),
    reste_a_payer: amountFr(line.cancelled ? 0 : line.remaining),
    statut: line.cancelled ? 'Annulée' : text(line.statusLabel),
    en_retard: !line.cancelled && line.remaining > 0 && line.echeance && timeOf(line.echeance) < today ? 'oui' : '',
  }));
  return {
    rows,
    totals: {
      nb_factures: String(summary.count),
      total_facture: amountFr(summary.total),
      total_encaisse: amountFr(summary.paid),
      total_reste: amountFr(summary.remaining),
    },
  };
}

/** Paiements (sans les supprimés), avec le numéro de leur facture. */
export function paymentRows(payments: Array<Record<string, any>>): TemplateRow[] {
  return chronological(payments.filter((payment) => !payment.deleted_at), (payment) => payment.datePaiement)
    .slice(0, TEMPLATE_LIST_MAX)
    .map((payment) => ({
      date: dateFr(payment.datePaiement),
      montant: amountFr(payment.montant),
      mode: PAYMENT_MODE_LABELS[text(payment.modePaiement)] ?? text(payment.modePaiement),
      statut: PAYMENT_STATUS_LABELS[text(payment.status)] ?? text(payment.status),
      reference: text(payment.reference) || text(payment.numeroCheque),
      facture: text(payment.facture?.numero ?? payment.facture_numero),
    }));
}

export function audienceRows(audiences: Array<Record<string, any>>): TemplateRow[] {
  return chronological(audiences, (audience) => audience.audience_date).slice(0, TEMPLATE_LIST_MAX).map((audience) => ({
    date: dateFr(audience.audience_date),
    heure: text(audience.audience_time).slice(0, 5),
    juridiction: text(audience.jurisdiction?.name),
    salle: text(audience.room),
    juge: text(audience.judge_name),
    type: text(audience.audience_type?.name),
    statut: AUDIENCE_STATUS_LABELS[text(audience.status)] ?? text(audience.status),
    decision: text(audience.decision_text || audience.decision || audience.outcome),
    renvoi: dateFr(audience.postponed_to),
  }));
}

/** Prochaine audience à venir (date et heure), vide sinon. */
export function nextAudience(audiences: Array<Record<string, any>>): string {
  const today = startOfToday();
  const next = chronological(
    audiences.filter((audience) => timeOf(audience.audience_date) >= today && Number(audience.status) !== 3),
    (audience) => audience.audience_date,
  )[0];
  if (!next) return '';
  const time = text(next.audience_time).slice(0, 5);
  return `${dateFr(next.audience_date)}${time ? ` à ${time}` : ''}`;
}

export function actionRows(actions: Array<Record<string, any>>, users: Map<number, any> = new Map()): TemplateRow[] {
  return chronological(actions, (action) => action.due_at ?? action.planned_at ?? action.created_at).slice(0, TEMPLATE_LIST_MAX).map((action) => ({
    titre: text(action.title || action.definition_label),
    statut: DOSSIER_ACTION_STATUS_LABELS[text(action.status)] ?? text(action.status),
    priorite: DOSSIER_ACTION_PRIORITY_LABELS[text(action.priority)] ?? text(action.priority),
    echeance: dateFr(action.due_at),
    terminee_le: dateFr(action.completed_at),
    responsable: userName(users.get(Number(action.responsible_user_id))),
    resultat: text(action.result_notes || action.result_code),
  }));
}

/** Diligences non confidentielles. */
export function diligenceRows(diligences: Array<Record<string, any>>): TemplateRow[] {
  return chronological(diligences.filter((diligence) => !diligence.confidential), (diligence) => diligence.deadline ?? diligence.start_date)
    .slice(0, TEMPLATE_LIST_MAX)
    .map((diligence) => ({
      titre: text(diligence.title),
      type: text(diligence.type),
      statut: DILIGENCE_STATUS_LABELS[text(diligence.status)] ?? text(diligence.status),
      date_limite: dateFr(diligence.deadline),
      avocat: userName(diligence.assigned_lawyer),
    }));
}

/** Pièces non confidentielles. */
export function documentRows(documents: Array<Record<string, any>>): TemplateRow[] {
  return chronological(documents.filter((document) => !document.is_confidential), (document) => document.created_at)
    .slice(0, TEMPLATE_LIST_MAX)
    .map((document) => ({
      nom: text(document.name || document.original_name),
      type: text(document.document_type?.name),
      date: dateFr(document.created_at),
    }));
}

export function dossierRows(dossiers: Array<Record<string, any>>): TemplateRow[] {
  return chronological(dossiers, (dossier) => dossier.opening_date ?? dossier.created_at).slice(0, TEMPLATE_LIST_MAX).map((dossier) => ({
    numero: text(dossier.dossier_number),
    objet: text(dossier.object),
    statut: DOSSIER_STATUS_LABELS[Number(dossier.status)] ?? text(dossier.status),
    date_ouverture: dateFr(dossier.opening_date),
  }));
}

/**
 * Complète `target` avec ce qui lui manque de `source` (objets fusionnés,
 * valeur absente ou vide remplacée) : le contexte déjà construit par
 * l'appelant reste prioritaire.
 */
export function mergeMissing(target: Record<string, any>, source: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = { ...target };
  for (const [key, value] of Object.entries(source ?? {})) {
    const current = out[key];
    if (value && typeof value === 'object' && !Array.isArray(value) && current && typeof current === 'object' && !Array.isArray(current)) {
      out[key] = mergeMissing(current, value);
    } else if (current === undefined || current === null || current === '') {
      out[key] = value;
    }
  }
  return out;
}
