/**
 * CONTRAT DE DONNÉES DE L'EXPORT HORS-LIGNE (format 1) — lu par la visionneuse
 * statique du Lot 2 (`export/viewer/`). Voir `EXPORT_FORMAT.md`.
 *
 * Toute évolution incompatible incrémente `EXPORT_FORMAT_VERSION`.
 * Conventions :
 *  - dates : chaînes ISO 8601 (`2026-10-28` ou `2026-10-28T09:30:00.000Z`) ou null ;
 *  - montants : nombres (pas de chaînes décimales) ;
 *  - chemins : relatifs à la racine du ZIP, séparateur `/` ;
 *  - une section absente des droits de l'utilisateur vaut `null` (≠ `[]` vide)
 *    et `access.<section>` vaut false.
 */

export const EXPORT_FORMAT_VERSION = 1;

export type IsoDate = string;

export interface ExportCabinet {
  id: number;
  code: string | null;
  name: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
}

/** `data/index.js` → `window.__EXPORT__.manifest`. */
export interface ExportManifest {
  format_version: number;
  generated_at: IsoDate;
  cabinet: ExportCabinet | null;
  dossiers: ExportManifestEntry[];
}

export interface ExportManifestEntry {
  id: number;
  dossier_number: string;
  object: string | null;
  client: string | null;
  status: string | null;
  opening_date: IsoDate | null;
  /** Dossier du ZIP : `Dossier_<numero>`. */
  folder: string;
  /** Script de données : `data/dossier-<id>.js`. */
  data: string;
  /** Script SQL : `database/dossier-<numero>.sql`. */
  sql: string;
}

export interface ExportAccess {
  invoices: boolean;
  billing: boolean;
  actions: boolean;
}

export interface ExportPerson {
  id: number;
  full_name: string | null;
}

export interface ExportRef {
  id: number;
  name: string | null;
}

/** `data/dossier-<id>.js` → un élément de `window.__EXPORT__.dossiers`. */
export interface ExportDossier {
  format_version: number;
  id: number;
  dossier_number: string;
  folder: string;
  sql: string;
  access: ExportAccess;
  dossier: {
    object: string | null;
    status: string | null;
    outcome: string | null;
    lifecycle_phase: string | null;
    opening_date: IsoDate | null;
    closing_date: IsoDate | null;
    priority_level: number | null;
    case_number: string | null;
    court_name: string | null;
    opposing_party_name: string | null;
    opposing_party_lawyer: string | null;
    initial_request: string | null;
    final_decision: string | null;
    client: {
      id: number;
      full_name: string | null;
      company_name: string | null;
      email: string | null;
      phone: string | null;
      address: string | null;
      customer_code: string | null;
    } | null;
    lawyer: ExportPerson | null;
    procedure_type: ExportRef | null;
    jurisdiction: ExportRef | null;
  };
  stats: {
    documents: number;
    audiences: number;
    diligences: number;
    steps: number;
    actions: number | null;
    invoices: number | null;
    payments: number | null;
  };
  documents: ExportDocument[];
  audiences: ExportAudience[];
  diligences: ExportDiligence[];
  steps: ExportStep[];
  actions: ExportAction[] | null;
  billing: ExportBilling | null;
  invoices: ExportInvoice[] | null;
  invoice_totals: ExportInvoiceTotals | null;
}

export interface ExportDocument {
  id: number;
  name: string | null;
  status: string | null;
  mimetype: string | null;
  size: number | null;
  created_at: IsoDate | null;
  /** Fichier dans le ZIP (`Dossier_x/documents/...`), null si introuvable sur le serveur. */
  path: string | null;
}

export interface ExportAudience {
  id: number;
  date: IsoDate | null;
  time: string | null;
  type: number | null;
  type_label: string | null;
  status: number | null;
  status_label: string | null;
  jurisdiction: ExportRef | null;
  room: string | null;
  judge_name: string | null;
  duration_minutes: number | null;
  outcome: string | null;
  notes: string | null;
  postponed_to: IsoDate | null;
  parent_audience_id: number | null;
  decision: string | null;
  decision_text: string | null;
  decision_date: IsoDate | null;
  decision_outcome: string | null;
  decision_notes: string | null;
  report_content: string | null;
  report_date: IsoDate | null;
  document_ids: number[];
  decision_document_ids: number[];
  report_document_ids: number[];
}

export interface ExportDiligence {
  id: number;
  title: string | null;
  type: string | null;
  status: string | null;
  deadline: IsoDate | null;
  completion_date: IsoDate | null;
  assigned_lawyer: ExportPerson | null;
  budget_hours: number | null;
  actual_hours: number | null;
  scope: string | null;
  findings_summary: string | null;
  recommendations: string | null;
  confidential: boolean;
}

export interface ExportStep {
  id: number;
  title: string | null;
  type: string | null;
  type_label: string | null;
  status: number | null;
  status_label: string | null;
  scheduled_date: IsoDate | null;
  completed_date: IsoDate | null;
  description: string | null;
  document_ids: number[];
  audience_ids: number[];
  diligence_ids: number[];
  /** Vide sans droit factures. */
  invoice_ids: string[];
}

export interface ExportAction {
  id: string;
  title: string | null;
  definition_code: string | null;
  definition_label: string | null;
  status: string;
  status_label: string;
  priority: string;
  priority_label: string;
  is_required: boolean;
  responsible: ExportPerson | null;
  planned_at: IsoDate | null;
  due_at: IsoDate | null;
  started_at: IsoDate | null;
  completed_at: IsoDate | null;
  cancelled_at: IsoDate | null;
  result_code: string | null;
  result_notes: string | null;
  duration_minutes: number | null;
  billing_decision: string;
  billing_decision_label: string;
  billing_reason: string | null;
  documents: { document_id: number; role: string }[];
  audiences: { audience_id: number; role: string }[];
  /** Actions liées (role DEPENDS_ON…). */
  relations: { action_id: string; role: string }[];
}

export interface ExportBilling {
  profile: {
    currency: string;
    mode: string;
    vat_rate: number | null;
    fixed_fee: number | null;
    hourly_rate: number | null;
    percentage_rate: number | null;
    percentage_base: number | null;
    opening_fee: number | null;
    opening_fee_enabled: boolean;
    default_vacation_rate: number | null;
    result_fee_enabled: boolean;
    result_fee_rate: number | null;
    rebill_expenses: boolean;
    rebill_disbursements: boolean;
    is_confirmed: boolean;
  } | null;
  rules: {
    id: string;
    code: string;
    fee_type: string;
    trigger: string;
    category: string | null;
    calculation_mode: string;
    rate: number | null;
    action_definition_code: string | null;
    is_active: boolean;
  }[];
  items: {
    id: string;
    label: string | null;
    category: string;
    source_type: string;
    calculation_mode: string;
    status: string;
    occurred_at: IsoDate | null;
    quantity: number;
    unit_label: string | null;
    unit_price: number;
    net_amount: number;
    tax_rate: number;
    tax_amount: number;
    gross_amount: number;
    currency: string;
    action_id: string | null;
    /** Rattachement à une ligne de facture (null : pas encore facturé). */
    invoice_line_id: string | null;
  }[];
}

export interface ExportInvoice {
  id: string;
  numero: string | null;
  type: number | null;
  type_label: string | null;
  status: number;
  status_label: string;
  label: string | null;
  date: IsoDate | null;
  due_date: IsoDate | null;
  currency: string;
  amount_ht: number;
  vat_rate: number;
  vat_amount: number;
  amount_ttc: number;
  /** Paiements validés seulement (`facture/invoice-totals.ts`). */
  paid: number;
  remaining: number;
  cancelled: boolean;
  draft: boolean;
  credit: boolean;
  original_invoice_id: string | null;
  /** PDF serveur dans le ZIP (`Dossier_x/factures/<numero>.pdf`), null si échec. */
  pdf: string | null;
  lines: {
    id: string;
    label: string | null;
    category: string | null;
    quantity: number;
    unit_label: string | null;
    unit_price: number;
    net_amount: number;
    tax_rate: number;
    tax_amount: number;
    gross_amount: number;
  }[];
  payments: {
    id: string;
    date: IsoDate | null;
    value_date: IsoDate | null;
    amount: number;
    mode: number | null;
    mode_label: string | null;
    status: number | null;
    status_label: string | null;
    /** true : compté dans `paid`. */
    validated: boolean;
    reference: string | null;
    cheque_number: string | null;
    bank: string | null;
    notes: string | null;
  }[];
}

export interface ExportInvoiceTotals {
  count: number;
  total: number;
  paid: number;
  remaining: number;
  cancelled: { count: number; amount: number };
  drafts: { count: number; amount: number };
  credits: { count: number; amount: number };
}

/** Script JS chargeable en `file://` (où `fetch` d'un JSON est interdit). */
export function exportScript(assign: string, value: unknown): string {
  // U+2028 / U+2029 : valides en JSON, mais fins de ligne pour d'anciens moteurs JS.
  const json = JSON.stringify(value)
    .split(String.fromCharCode(0x2028))
    .join('\\u2028')
    .split(String.fromCharCode(0x2029))
    .join('\\u2029');
  return [
    '/* Export hors-ligne — généré automatiquement, ne pas modifier. */',
    'window.__EXPORT__ = window.__EXPORT__ || { dossiers: [] };',
    `${assign}(${json});`,
    '',
  ].join('\n');
}
