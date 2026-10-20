/**
 * Compte rendu d'un plan d'écriture IA exécuté : pour chaque élément créé,
 * modifié ou supprimé, sa référence métier, un lien vers sa fiche et les
 * champs renseignés, en Markdown (le chat transforme les liens relatifs en
 * liens internes).
 */
import { rowLabel } from './plan-field-options';
import type { WriteResult } from './write-handler.registry';

/** Libellés métier fournis par le schéma (tables, colonnes, valeurs codées). */
export interface SummaryLabels {
  table(entity: string): string;
  column(entity: string, column: string): string;
  /** Libellé d'une valeur codée (« 3 » → « Passée »), sinon `null`. */
  value(entity: string, column: string, value: unknown): string | null;
}

/** « dossiers:94 » → « DOS-2026-0039 — Trouble de jouissance ». */
export type RelatedLabels = Map<string, string>;

type Row = Record<string, any>;

/** Fiche de l'application pour une ligne d'une table, quand elle existe. */
const ROUTES: Record<string, (id: string | number, row: Row) => string | null> = {
  dossiers: (id) => `/dossiers/${id}`,
  customer: (id) => `/clients/${id}`,
  audiences: (id) => `/audiences/${id}`,
  diligences: (id) => `/dossiers/diligences/${id}`,
  factures: (id) => `/facturation/factures/${id}`,
  paiements: (id, row) => (row.facture_id ? `/facturation/factures/${row.facture_id}/paiment/${id}` : null),
  employee: (id) => `/gestion-cabinet/employees/${id}`,
  document_customer: (id) => `/documents/${id}`,
  supplier: (id) => `/suppliers/${id}`,
  supplier_invoice: (id) => `/supplier-invoices/${id}`,
  expense_report: (id) => `/expense-reports/${id}`,
  expense_line: (id) => `/expense-lines/${id}`,
  referrer: (id) => `/referrers/${id}`,
  dossier_referral: (id) => `/dossier-referrals/${id}`,
  referral_commission: (id) => `/referral-commissions/${id}`,
  jurisdictions: (id) => `/dossiers/juridiction/${id}`,
  procedure_instances: (id) => `/procedures/instances/${id}`,
  ecritures_comptables: (id) => `/comptabilite/ecritures/${id}`,
  payslip: (id) => `/payslips/${id}`,
  payroll_period: (id) => `/payroll-periods/${id}`,
  salary_advance: (id) => `/salary-advances/${id}`,
  dossier_actions: (_id, row) => (row.dossier_id ? `/dossiers/${row.dossier_id}/actions` : null),
  findings: (id, row) => (row.diligence_id ? `/dossiers/diligences/${row.diligence_id}/finding/${id}` : null),
};

/** Entités parentes rappelées à côté d'un élément (« · Dossier DOS-… »). */
export const PARENT_LINKS: Array<{ column: string; entity: string }> = [
  { column: 'dossier_id', entity: 'dossiers' },
  { column: 'customer_id', entity: 'customer' },
  { column: 'facture_id', entity: 'factures' },
  { column: 'supplier_id', entity: 'supplier' },
];

/** Colonnes jamais listées comme « champ renseigné ». */
const HIDDEN_COLUMNS = /^(id|tenant_id|created_at|updated_at|deleted_at|created_by|updated_by|deleted_by|password|token|secret|.*_hash)$/i;

const MAX_LISTED = 8;

export function resourceHref(entity: string, id: string | number | undefined, row: Row = {}): string | null {
  if (id === undefined || id === null || id === '') return null;
  return ROUTES[entity]?.(id, row) ?? null;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Date/heure lisibles (« 15/11/2026 », « 09:00 ») ; le reste tel quel. */
export function displayValue(value: unknown): string {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '';
    const date = `${pad(value.getDate())}/${pad(value.getMonth() + 1)}/${value.getFullYear()}`;
    const time = value.getHours() || value.getMinutes() ? ` ${pad(value.getHours())}:${pad(value.getMinutes())}` : '';
    return date + time;
  }
  if (typeof value === 'boolean') return value ? 'Oui' : 'Non';
  const text = String(value ?? '').trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}${iso[4] && `${iso[4]}:${iso[5]}` !== '00:00' ? ` ${iso[4]}:${iso[5]}` : ''}`;
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(text)) return text.slice(0, 5);
  return text;
}

/** Référence lisible d'un élément : numéro métier, nom, ou date pour une audience. */
export function resourceTitle(entity: string, row: Row = {}, id?: string | number): string {
  if (entity === 'audiences' && row.audience_date) {
    const time = row.audience_time ? ` à ${displayValue(row.audience_time)}` : '';
    return `Audience du ${displayValue(row.audience_date).slice(0, 10)}${time}`;
  }
  if (entity === 'dossiers' && row.dossier_number) {
    return row.object ? `${row.dossier_number} — ${row.object}` : String(row.dossier_number);
  }
  const label = rowLabel(row);
  return label && label !== `#${row.id}` ? label : `#${id ?? row.id ?? '?'}`;
}

const markdownText = (text: string) => text.replace(/([[\]])/g, '\\$1');

function link(text: string, href: string | null): string {
  return href ? `[${markdownText(text)}](${href})` : `**${markdownText(text)}**`;
}

function parentsOf(row: Row, entity: string, related: RelatedLabels, labels: SummaryLabels): string[] {
  return PARENT_LINKS
    .filter((parent) => parent.entity !== entity && row[parent.column])
    .map((parent) => {
      const id = row[parent.column];
      const title = related.get(`${parent.entity}:${id}`) ?? `#${id}`;
      return `${labels.table(parent.entity)} ${link(title, resourceHref(parent.entity, id))}`;
    });
}

/** « Statut : Passée · Date : 15/11/2026 » pour les champs écrits. */
function fieldsLine(entity: string, row: Row, keys: string[], labels: SummaryLabels): string {
  return keys
    .filter((key) => !HIDDEN_COLUMNS.test(key) && !PARENT_LINKS.some((p) => p.column === key))
    .map((key) => {
      const value = row[key];
      if (value === undefined || value === null || value === '' || typeof value === 'object' && !(value instanceof Date)) return null;
      const shown = labels.value(entity, key, value) ?? displayValue(value);
      return shown ? `${labels.column(entity, key)} : ${shown}` : null;
    })
    .filter(Boolean)
    .slice(0, 6)
    .join(' · ');
}

function line(result: WriteResult, related: RelatedLabels, labels: SummaryLabels): string {
  const entity = result.entity ?? '';
  const row: Row = result.data && typeof result.data === 'object' ? result.data : {};
  const id = result.entityId ?? row.id;
  const table = labels.table(entity);
  const title = resourceTitle(entity, row, id);
  const parts = [`${table} ${link(title, resourceHref(entity, id, row))}`, ...parentsOf(row, entity, related, labels)];
  // Action (envoi…) : ce qui a été fait, puis l'élément concerné.
  if (result.operation === 'ACTION') return `- ${markdownText(result.message)}\n  ${parts.join(' · ')}`;
  const fields = result.operation === 'DELETE' ? '' : fieldsLine(entity, row, result.changedFields ?? [], labels);
  return `- ${parts.join(' · ')}${fields ? `\n  ${fields}` : ''}`;
}

const SECTIONS: Array<{ operation: WriteResult['operation']; title: string; duplicate?: boolean }> = [
  { operation: 'INSERT', title: '🆕 Créé' },
  { operation: 'INSERT', title: '♻️ Déjà existant (réutilisé)', duplicate: true },
  { operation: 'UPDATE', title: '✏️ Mis à jour' },
  { operation: 'DELETE', title: '🗑️ Supprimé' },
  // Envois d'e-mails, messages, report d'audience… (compétences du chat).
  { operation: 'ACTION', title: '⚡ Actions effectuées' },
];

/**
 * Message Markdown du plan exécuté. Les échecs gardent le message du handler ;
 * une liste longue (mise à jour groupée) est tronquée avec « … et N autres ».
 */
export function summarizeWriteResults(
  results: WriteResult[],
  labels: SummaryLabels,
  related: RelatedLabels = new Map(),
): string {
  const ok = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);
  const total = results.length;
  const head = failed.length === 0
    ? `✅ **Opération réussie** — ${total} opération${total > 1 ? 's' : ''} effectuée${total > 1 ? 's' : ''}.`
    : `⚠️ **Opération partiellement réussie** — ${ok.length} réussie(s), ${failed.length} en échec.`;

  const blocks: string[] = [head];
  for (const section of SECTIONS) {
    const items = ok.filter((r) =>
      r.operation === section.operation &&
      (section.operation !== 'INSERT' || (r.affected === 0) === !!section.duplicate),
    );
    if (!items.length) continue;
    const lines = items.slice(0, MAX_LISTED).map((r) => line(r, related, labels));
    if (items.length > MAX_LISTED) lines.push(`- … et ${items.length - MAX_LISTED} autre(s)`);
    blocks.push(`**${section.title}${items.length > 1 ? ` (${items.length})` : ''}**\n${lines.join('\n')}`);
  }

  const cascade = results.flatMap((r) => r.cascadeCreations ?? []);
  if (cascade.length) {
    blocks.push(`**📦 Créé automatiquement**\n${cascade
      .map((c) => {
        const row = c.entity && typeof c.entity === 'object' ? c.entity : {};
        const title = resourceTitle(c.entityName, row, row.id) || c.searchTerm;
        return `- ${labels.table(c.entityName)} ${link(title, resourceHref(c.entityName, row.id, row))}`;
      })
      .join('\n')}`);
  }

  if (failed.length) {
    blocks.push(`**❌ Échecs**\n${failed.map((r) => `- ${r.message}`).join('\n')}`);
  }
  return blocks.join('\n\n');
}

/** Identifiants des entités parentes à libeller (« dossiers » → {94, 95}). */
export function parentIdsToLabel(results: WriteResult[]): Map<string, Set<string | number>> {
  const wanted = new Map<string, Set<string | number>>();
  const rows = [
    ...results.map((r) => ({ entity: r.entity ?? '', row: r.data })),
    ...results.flatMap((r) => r.cascadeCreations ?? []).map((c) => ({ entity: c.entityName, row: c.entity })),
  ];
  for (const { entity, row } of rows) {
    if (!row || typeof row !== 'object') continue;
    for (const parent of PARENT_LINKS) {
      const id = row[parent.column];
      if (parent.entity === entity || id === undefined || id === null || id === '') continue;
      const ids = wanted.get(parent.entity) ?? new Set();
      ids.add(id);
      wanted.set(parent.entity, ids);
    }
  }
  return wanted;
}
