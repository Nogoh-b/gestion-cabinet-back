import { maskNested, SQL_KEYWORDS } from './tenant-injection';

/**
 * Enregistrements montrés à l'utilisateur par une lecture IA, mémorisés pour
 * que la demande suivante (« corrige-les », « passe la 2e en validée ») puisse
 * agir dessus sans redemander d'identifiant.
 *
 * Le SQL de lecture sélectionne la clé primaire sous l'alias `ref__<table>` ;
 * cette colonne est retirée des résultats avant analyse et affichage, et
 * seule cette mémoire la conserve.
 */
export interface DisplayedRecord {
  entity: string;
  id: string | number;
  /** Valeurs lisibles de la ligne affichée (« label=Juin 2023, start_date=2026-09-30 »). */
  summary: string;
  /** Référence lisible (numéro, nom, libellé) telle que la réponse la cite. */
  label?: string;
}

export const DISPLAYED_RECORD_ALIAS = /^ref__([a-z0-9_]+)$/i;
const MAX_RECORDS = 30;
const MAX_SUMMARY = 180;

const pad = (n: number) => String(n).padStart(2, '0');

/** Colonnes qui nomment une ligne, par ordre de préférence. */
const NUMBER_KEYS = /(^|_)(numero|number|num|reference|ref|code|matricule)(_|$)/i;
const NAME_KEYS = /(^|_)(full_name|nom_complet|name|nom|client|raison_sociale|company_name|company)(_|$)/i;
const TITLE_KEYS = /(^|_)(title|titre|label|libelle|intitule|objet|object|subject)(_|$)/i;
/** Tables de personnes : le nom les désigne mieux qu'un code. */
const PERSON_TABLES = new Set(['customer', 'employee', 'user', 'referrer', 'supplier']);

/** Libellé d'une ligne pour la table `entity` (numéro métier, nom, titre…). */
export function recordLabel(entity: string, row: Record<string, any>): string | undefined {
  const text = (v: unknown) => (typeof v === 'string' || typeof v === 'number') && String(v).trim() ? String(v).trim() : undefined;
  const entries = Object.entries(row).filter(([key]) => !DISPLAYED_RECORD_ALIAS.test(key));
  const pick = (pattern: RegExp) => entries.map(([key, value]) => (pattern.test(key) ? text(value) : undefined)).find(Boolean);
  const order = PERSON_TABLES.has(entity) ? [NAME_KEYS, NUMBER_KEYS, TITLE_KEYS] : [NUMBER_KEYS, TITLE_KEYS, NAME_KEYS];
  for (const pattern of order) {
    const found = pick(pattern);
    if (found) return found.slice(0, 80);
  }
  // Repli : premier texte court qui n'est ni une date ni un nombre.
  return entries
    .map(([, value]) => (typeof value === 'string' ? value.trim() : ''))
    .find((v) => v.length >= 2 && v.length <= 80 && !/^\d{4}-\d{2}-\d{2}/.test(v) && !/^-?\d+([.,]\d+)?$/.test(v));
}

/**
 * Un DATE MySQL arrive en Date à minuit HEURE LOCALE : sérialisé en ISO (UTC),
 * il recule d'un jour (30/09 devient 29/09). On le rend donc en heure locale.
 */
export function formatSqlDate(value: Date): string {
  if (Number.isNaN(value.getTime())) return '';
  const day = `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  const time = `${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
  return time === '00:00:00' ? day : `${day} ${time}`;
}

const AGGREGATE_CALL = /\b(count|sum|avg|min|max|group_concat|json_arrayagg|json_objectagg|std|stddev|variance)\s*\(/i;

/**
 * Ajoute la clé primaire de la table principale (`d.id AS ref__dossiers`) à
 * une requête qui LISTE des enregistrements, quand le modèle l'a oubliée
 * (règle 15 du prompt SQL) : la réponse peut alors renvoyer leurs
 * identifiants. Requête inchangée si elle agrège ou dédoublonne (GROUP BY,
 * DISTINCT, UNION, COUNT…), si elle a déjà une colonne ref__, ou si sa table
 * principale n'a pas de colonne `id` (`hasIdKey`).
 */
export function withRecordRefs(sql: string, hasIdKey: (table: string) => boolean): string {
  if (/\bref__/i.test(sql)) return sql;
  const masked = maskNested(sql);
  if (!/^\s*select\b/i.test(masked)) return sql;
  if (/\b(union|group\s+by|distinct|distinctrow)\b/i.test(masked)) return sql;
  const from = /\bfrom\s+`?([a-z0-9_]+)`?(?:\s+(?:as\s+)?`?([a-z0-9_]+)`?)?/i.exec(masked);
  if (!from) return sql;
  const selectList = masked.slice(masked.search(/\bselect\b/i) + 6, from.index);
  if (AGGREGATE_CALL.test(selectList) || /\bover\b/i.test(selectList)) return sql;
  const table = from[1].toLowerCase();
  if (!hasIdKey(table)) return sql;
  const alias = from[2] && !SQL_KEYWORDS.has(from[2].toLowerCase()) ? from[2] : from[1];
  return `${sql.slice(0, from.index).trimEnd()}, ${alias}.id AS ref__${table} ${sql.slice(from.index)}`;
}

/** Retire les colonnes ref__*, normalise les dates et collecte les enregistrements affichés. */
export function extractDisplayedRecords(rows: any[]): {
  rows: any[];
  records: DisplayedRecord[];
} {
  const records: DisplayedRecord[] = [];
  const cleaned = rows.map((row) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return row;
    const out: Record<string, any> = {};
    const refs: Array<{ entity: string; id: string | number }> = [];
    for (const [key, raw] of Object.entries(row)) {
      const value = raw instanceof Date ? formatSqlDate(raw) : raw;
      const ref = key.match(DISPLAYED_RECORD_ALIAS);
      if (ref) {
        if (value !== null && value !== undefined && value !== '') {
          refs.push({ entity: ref[1].toLowerCase(), id: value as string | number });
        }
        continue;
      }
      out[key] = value;
    }
    if (refs.length) {
      const summary = Object.entries(out)
        .filter(([, v]) => v !== null && v !== undefined && v !== '' && typeof v !== 'object')
        .map(([k, v]) => `${k}=${String(v).replace(/\s+/g, ' ')}`)
        .join(', ')
        .slice(0, MAX_SUMMARY);
      for (const ref of refs) {
        const label = recordLabel(ref.entity, out);
        records.push({ ...ref, summary, ...(label && { label }) });
      }
    }
    return out;
  });
  return { rows: cleaned, records: dedupe(records).slice(0, MAX_RECORDS) };
}

function dedupe(records: DisplayedRecord[]): DisplayedRecord[] {
  const seen = new Set<string>();
  return records.filter((r) => {
    const key = `${r.entity}#${r.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Bloc ajouté à l'historique du planner d'écriture. */
export function formatDisplayedRecordsForPlanner(records: DisplayedRecord[]): string {
  if (!records.length) return '';
  return [
    'ENREGISTREMENTS AFFICHES A L\'UTILISATEUR (identifiants internes, dans l\'ordre de la reponse) :',
    ...records.map((r, i) => `${i + 1}. ${r.entity} #${r.id} : ${r.summary || '(sans detail)'}`),
  ].join('\n');
}

/**
 * Valeur de `match` venant du LLM → valeur comparable en base : les dates
 * françaises (30/09/2026) deviennent ISO, les espaces superflus disparaissent.
 */
export function normalizeMatchValue(value: unknown): unknown {
  if (value instanceof Date) return formatSqlDate(value);
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  const fr = trimmed.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (fr) return `${fr[3]}-${pad(Number(fr[2]))}-${pad(Number(fr[1]))}`;
  const iso = trimmed.match(/^(\d{4}-\d{2}-\d{2})T00:00:00(?:\.000)?Z?$/);
  return iso ? iso[1] : trimmed;
}
