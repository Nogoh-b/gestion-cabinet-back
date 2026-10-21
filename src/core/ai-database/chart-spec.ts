// src/core/ai-database/chart-spec.ts

/**
 * Graphique d'une réponse du chat, calculé sans IA à partir des lignes lues
 * (2026-10-21) : un libellé (texte ou date) et 1 à 3 valeurs numériques, sur
 * 2 à 30 lignes. Barres par défaut, courbe pour une suite de dates ou de
 * mois, camembert pour une répartition courte.
 */

export interface ChartSpec {
  type: 'bar' | 'line' | 'pie';
  title?: string;
  xKey: string;
  xLabel: string;
  series: Array<{ key: string; label: string }>;
  data: Array<Record<string, string | number>>;
  /** Unité des valeurs (« FCFA » pour les montants). */
  unit?: string;
}

/** La question appelle des chiffres à comparer (sinon pas de graphique). */
const FIGURES_QUESTION = /\b(?:combien|nombre|total|totaux|somme|montant|chiffre|statistique|stat|repartition|evolution|par mois|par an|par annee|par trimestre|par semaine|par jour|par dossier|par client|par avocat|par type|par statut|par juridiction|top|classement|graphique|graphe|courbe|histogramme|camembert|diagramme|chart|compare|comparaison|tendance)\b/;

const PIE_QUESTION = /\b(?:repartition|part|parts|proportion|pourcentage|camembert)\b/;

const ID_COLUMN = /^(?:id|ref__.*|.*_id|uuid|tenant_id)$/i;

const MONEY_COLUMN = /montant|total|reste|chiffre|honoraire|somme|paye|regle|encaisse|du$|ttc|ht$|solde|prix|cout|frais|budget/i;

const MONTHS = /^(?:jan|fev|fév|mar|avr|apr|mai|may|jui|jun|jul|aou|aoû|aug|sep|oct|nov|dec|déc)/i;

function normalize(text: string): string {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const text = value.replace(/\s| | /g, '').replace(',', '.');
  if (!/^-?\d+(?:\.\d+)?$/.test(text)) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function isDateLike(value: unknown): boolean {
  if (value instanceof Date) return true;
  const text = String(value ?? '').trim();
  return /^\d{4}-\d{2}(?:-\d{2})?/.test(text) || /^\d{1,2}\/\d{4}$/.test(text) || MONTHS.test(text);
}

/** « montant_ttc » → « Montant TTC ». */
export function columnLabel(key: string): string {
  const words = key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim().split(/\s+/);
  return words
    .map((word, index) => (/^(ttc|ht|tva|rg|id)$/i.test(word) ? word.toUpperCase() : index === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word.toLowerCase()))
    .join(' ');
}

function labelText(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value ?? '').slice(0, 60);
}

export function buildChartSpec(rows: unknown, question = ''): ChartSpec | null {
  if (!Array.isArray(rows) || rows.length < 2 || rows.length > 30) return null;
  if (!rows.every((row) => row && typeof row === 'object' && !Array.isArray(row))) return null;
  const asked = normalize(question);
  if (!FIGURES_QUESTION.test(asked)) return null;

  const keys = Object.keys(rows[0] as Record<string, unknown>).filter((key) => !ID_COLUMN.test(key));
  const numeric = keys.filter((key) => {
    const values = rows.map((row) => asNumber((row as Record<string, unknown>)[key]));
    return values.filter((value) => value !== null).length >= Math.ceil(rows.length * 0.8);
  });
  const labels = keys.filter((key) => !numeric.includes(key));
  // Un libellé : texte ou date distincts (sinon la première colonne numérique de type année).
  let xKey = labels.find((key) => new Set(rows.map((row) => labelText((row as Record<string, unknown>)[key]))).size >= 2);
  let values = numeric;
  if (!xKey) {
    const year = numeric.find((key) => /annee|year|mois|month|trimestre/.test(normalize(key)));
    if (!year) return null;
    xKey = year;
    values = numeric.filter((key) => key !== year);
  }
  values = values.slice(0, 3);
  if (!values.length) return null;

  const data = rows.map((row) => {
    const record = row as Record<string, unknown>;
    const point: Record<string, string | number> = { [xKey!]: labelText(record[xKey!]) };
    for (const key of values) point[key] = asNumber(record[key]) ?? 0;
    return point;
  });
  // Toutes les valeurs nulles : rien à montrer.
  if (data.every((point) => values.every((key) => !point[key]))) return null;

  const timeline = rows.every((row) => isDateLike((row as Record<string, unknown>)[xKey!]));
  const type: ChartSpec['type'] = timeline
    ? 'line'
    : PIE_QUESTION.test(asked) && values.length === 1 && rows.length <= 8 && data.every((point) => Number(point[values[0]]) >= 0)
      ? 'pie'
      : 'bar';
  return {
    type,
    xKey: xKey!,
    xLabel: columnLabel(xKey!),
    series: values.map((key) => ({ key, label: columnLabel(key) })),
    data: timeline ? [...data].sort((a, b) => String(a[xKey!]).localeCompare(String(b[xKey!]))) : data,
    ...(values.every((key) => MONEY_COLUMN.test(normalize(key))) && { unit: 'FCFA' }),
  };
}
