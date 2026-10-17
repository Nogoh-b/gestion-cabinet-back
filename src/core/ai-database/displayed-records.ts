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
}

export const DISPLAYED_RECORD_ALIAS = /^ref__([a-z0-9_]+)$/i;
const MAX_RECORDS = 30;
const MAX_SUMMARY = 180;

const pad = (n: number) => String(n).padStart(2, '0');

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
      for (const ref of refs) records.push({ ...ref, summary });
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
