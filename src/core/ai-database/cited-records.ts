/**
 * Enregistrements CITÉS par une réponse du chat, avec leur identifiant.
 *
 * Une réponse (lecture ou résultat d'écriture) renvoie la liste des
 * enregistrements qu'elle cite : table, identifiant, libellé et lien. Le chat
 * la garde avec le message et la renvoie dans l'historique visible : la
 * demande suivante (« modifie-le », « passe la 2e en clôturé ») vise alors
 * l'enregistrement par son identifiant, sans aucune recherche approchante.
 */
import type { VisibleHistoryMessage } from './dto/ask-question.dto';
import { resourceHref } from './write/write-result-summary';
import type { DisplayedRecord } from './displayed-records';

/** Référence d'un enregistrement cité, au format des références du chat. */
export interface CitedReference {
  /** Type du chat (dossier, client…) ; la table sinon. */
  type: string;
  /** Table de l'enregistrement (entité du plan d'écriture). */
  entity: string;
  id: string | number;
  label: string;
  href?: string;
}

/** Enregistrement cité tel que le planificateur le reçoit. */
export interface CitedRecord {
  entity: string;
  id: string | number;
  label?: string;
}

/** Table → type de référence du chat (mêmes types que les mentions @). */
const TABLE_TO_TYPE: Record<string, string> = {
  dossiers: 'dossier',
  customer: 'client',
  audiences: 'audience',
  factures: 'facture',
  employee: 'employee',
  document_customer: 'document',
  diligences: 'diligence',
  supplier: 'supplier',
  referrer: 'referrer',
  cabinets: 'cabinet',
};

/** Type du chat → table (références des messages utilisateur : mentions @). */
const TYPE_TO_TABLE: Record<string, string> = Object.fromEntries(
  Object.entries(TABLE_TO_TYPE).map(([table, type]) => [type, table]),
);

const MAX_CITED = 30;
const MAX_LABEL = 80;

export function toCitedReference(record: DisplayedRecord): CitedReference {
  const label = (record.label || record.summary || `#${record.id}`).slice(0, MAX_LABEL);
  const href = resourceHref(record.entity, record.id) ?? undefined;
  return {
    type: TABLE_TO_TYPE[record.entity] ?? record.entity,
    entity: record.entity,
    id: record.id,
    label,
    ...(href && { href }),
  };
}

/** Colonnes qui portent un identifiant métier lisible (FAC-2026-0041, DOS-2026-0038…). */
export const IDENTIFIER_COLUMN =
  /^(numero|number|reference|code|dossier_number|customer_code|case_number|invoice_number|[a-z_]+_(numero|number|reference|code))$/i;
/** Colonnes qui nomment un client ou une société. */
export const NAME_COLUMN = /^(full_name|company_name)$/i;
/** Colonnes de résultat qui contiennent un nom de personne ou de société. */
const NAME_RESULT_KEY = /client|customer|nom|name|raison|company|societe|soci[eé]t[eé]|fournisseur|supplier/i;

const CODE_VALUE = /^(?=.*\d)[A-Za-z0-9][A-Za-z0-9\-/_.]{2,39}$/;
const NAME_VALUE = /^[\p{L}][\p{L}'’\- ]{1,58}[\p{L}]$/u;

/**
 * Valeurs d'un résultat qui peuvent désigner un enregistrement : codes
 * métier (« FAC-2026-0041 ») et noms (« Émilie LEFÈVRE », pour les colonnes
 * de nom). Les nombres et les dates ne sont jamais retenus.
 */
export function identifierValues(rows: any[], max = 60): { codes: string[]; names: string[] } {
  const codes = new Set<string>();
  const names = new Set<string>();
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    for (const [key, raw] of Object.entries(row)) {
      if (typeof raw !== 'string') continue;
      const value = raw.trim();
      if (CODE_VALUE.test(value) && !/^-?\d+([.,]\d+)?$/.test(value) && !/^\d{4}-\d{2}-\d{2}/.test(value)) {
        codes.add(value);
      } else if (NAME_RESULT_KEY.test(key) && NAME_VALUE.test(value) && value.split(/\s+/).length <= 6) {
        names.add(value.replace(/\s+/g, ' '));
      }
    }
  }
  return { codes: [...codes].slice(0, max), names: [...names].slice(0, max) };
}

/** Tables lues par une requête SQL (FROM / JOIN, sous-requêtes comprises). */
export function tablesInSql(sql: string): string[] {
  const withoutStrings = sql.replace(/'(?:\\.|''|[^'\\])*'|"(?:\\.|""|[^"\\])*"/g, "''");
  const tables = [...withoutStrings.matchAll(/\b(?:from|join)\s+`?([a-z0-9_]+)`?/gi)].map((m) => m[1].toLowerCase());
  return [...new Set(tables)];
}

/** Fusionne des références en gardant la première occurrence de chaque enregistrement. */
export function mergeCitedReferences<T extends { entity?: string; type?: string; id: string | number }>(
  ...groups: T[][]
): T[] {
  const seen = new Set<string>();
  const merged: T[] = [];
  for (const ref of groups.flat()) {
    const key = `${ref.entity ?? ref.type}#${ref.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(ref);
  }
  return merged.slice(0, MAX_CITED);
}

/**
 * Motifs de liens des fiches (« /dossiers/94 » → dossiers#94), tirés de la
 * même table de routes que les résumés d'écriture. Les plus longs d'abord
 * (« /dossiers/diligences/12 » avant « /dossiers/94 »).
 */
const HREF_PATTERNS: Array<{ entity: string; pattern: RegExp }> = (() => {
  const SAMPLE = '987654321';
  const entities = [
    'dossiers', 'customer', 'audiences', 'diligences', 'factures', 'employee',
    'document_customer', 'supplier', 'supplier_invoice', 'expense_report',
    'expense_line', 'referrer', 'dossier_referral', 'referral_commission',
    'jurisdictions', 'procedure_instances', 'ecritures_comptables', 'payslip',
    'payroll_period', 'salary_advance',
  ];
  return entities
    .map((entity) => ({ entity, href: resourceHref(entity, SAMPLE) }))
    .filter((r): r is { entity: string; href: string } => !!r.href && r.href.endsWith(SAMPLE))
    .map(({ entity, href }) => ({ entity, prefix: href.slice(0, -SAMPLE.length) }))
    .sort((a, b) => b.prefix.length - a.prefix.length)
    .map(({ entity, prefix }) => ({
      entity,
      pattern: new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}(\\d+)$`),
    }));
})();

/** Table et identifiant d'un lien de fiche du chat, sinon null. */
export function recordFromHref(href: string): { entity: string; id: number } | null {
  const path = href.trim().split(/[?#]/)[0];
  for (const { entity, pattern } of HREF_PATTERNS) {
    const match = path.match(pattern);
    if (match) return { entity, id: Number(match[1]) };
  }
  return null;
}

/** Enregistrements cités par les liens Markdown d'un texte (« [DOS-2026-0004](/dossiers/94) »). */
export function citedRecordsFromLinks(content: string): CitedRecord[] {
  const records: CitedRecord[] = [];
  for (const match of content.matchAll(/\[((?:\\.|[^\]\\])+)\]\((\/[^)\s]+)\)/g)) {
    const record = recordFromHref(match[2]);
    if (record) records.push({ ...record, label: match[1].replace(/\\(.)/g, '$1').slice(0, MAX_LABEL) });
  }
  return records;
}

/** Références d'un message de l'historique visible → enregistrements pour le planificateur. */
function citedRecordsOf(message: VisibleHistoryMessage): CitedRecord[] {
  const fromRefs = (message.refs ?? [])
    .map((ref) => ({
      entity: ref.entity || TYPE_TO_TABLE[String(ref.type ?? '').toLowerCase()] || '',
      id: ref.id,
      label: ref.label,
    }))
    .filter((ref) => ref.entity && ref.id !== undefined && ref.id !== null && ref.id !== '');
  return mergeCitedReferences(fromRefs, citedRecordsFromLinks(message.content));
}

/** « [Enregistrements cités : dossiers#91 « DOS-2026-0001 » ; customer#12 « Jean Dupont »] » */
export function formatCitedLine(records: CitedRecord[]): string {
  if (!records.length) return '';
  const items = records.map((r) => `${r.entity}#${r.id}${r.label ? ` « ${r.label.replace(/\s+/g, ' ').trim()} »` : ''}`);
  return `[Enregistrements cités (table#id) : ${items.join(' ; ')}]`;
}

/** Le texte d'un message suivi de ses enregistrements cités (historique du SQL ou du planificateur). */
export function withCitedLine(message: VisibleHistoryMessage, maxContent = 1000): string {
  const line = formatCitedLine(citedRecordsOf(message));
  const content = message.content.length > maxContent ? `${message.content.slice(0, maxContent)}…` : message.content;
  return line ? `${content}\n${line}` : content;
}

const recordKey = (entity: string, id: string | number) =>
  `${String(entity).toLowerCase().replace(/s$/, '')}#${String(id).trim()}`;

/**
 * Enregistrements que l'utilisateur a sous les yeux : cités par l'historique,
 * mentionnés (@, page ouverte) ou mémorisés par la dernière lecture.
 */
export function knownRecordKeys(
  history: VisibleHistoryMessage[],
  referenced: Array<{ type?: string; id?: string | number; data?: { id?: string | number } }> = [],
  extra: CitedRecord[] = [],
): Set<string> {
  const keys = new Set<string>();
  for (const record of [...history.flatMap(citedRecordsOf), ...extra]) {
    keys.add(recordKey(record.entity, record.id));
  }
  for (const ref of referenced) {
    const id = ref.data?.id ?? ref.id;
    const type = String(ref.type ?? '').toLowerCase();
    if (id === undefined || id === null || !type) continue;
    keys.add(recordKey(TYPE_TO_TABLE[type] ?? type, id));
  }
  return keys;
}

/**
 * Opérations qui visent un identifiant que l'utilisateur n'a jamais vu (ni
 * cité, ni mentionné, ni tapé dans sa demande) : identifiant possiblement
 * inventé par le modèle. Le plan passe alors par la carte de confirmation,
 * qui montre l'enregistrement réellement visé.
 */
export function unverifiedTargets(
  operations: Array<{ operation: string; entity: string; entityId?: unknown }>,
  known: Set<string>,
  question: string,
): string[] {
  const typed = new Set(question.match(/\d+/g) ?? []);
  return operations
    .filter((op) => ['UPDATE', 'DELETE', 'ACTION'].includes(String(op.operation).toUpperCase()))
    .filter((op) => /^\d+$/.test(String(op.entityId ?? '')))
    .filter((op) => !known.has(recordKey(op.entity, op.entityId as string)) && !typed.has(String(op.entityId)))
    .map((op) => `${op.entity}#${op.entityId}`);
}

/** L'historique visible porte-t-il des identifiants d'enregistrements ? */
export function historyHasCitedRecords(history: VisibleHistoryMessage[]): boolean {
  return history.some((message) => citedRecordsOf(message).length > 0);
}

/**
 * Historique visible pour le planificateur : les derniers messages, chacun
 * suivi des enregistrements qu'il cite. En cas de dépassement, ce sont les
 * plus anciens qui tombent (la demande porte sur les derniers échanges).
 */
export function formatHistoryForPlanner(
  history: VisibleHistoryMessage[],
  { maxMessages = 6, maxChars = 4000 } = {},
): string {
  const blocks = history
    .slice(-maxMessages)
    .map((m) => `${m.role === 'user' ? 'UTILISATEUR' : 'ASSISTANT'}: ${withCitedLine(m)}`);
  const kept: string[] = [];
  let size = 0;
  for (const block of [...blocks].reverse()) {
    if (kept.length && size + block.length > maxChars) break;
    kept.unshift(block.slice(0, maxChars));
    size += block.length + 5;
  }
  return kept.join('\n---\n');
}
