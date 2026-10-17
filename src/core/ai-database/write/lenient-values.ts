/**
 * Conversion tolérante des valeurs fournies par le LLM vers les types attendus
 * par les colonnes. Les formulaires manuels envoient des valeurs déjà typées
 * (sélecteur de date, champ numérique…) ; le LLM, lui, recopie souvent la
 * forme humaine (« 1 500 000 FCFA », « 15/06/2026 », « 14h30 », « oui »).
 * Ces helpers ramènent ces formes vers une valeur exploitable au lieu de faire
 * échouer l'écriture. Ils renvoient `null` quand la valeur est inexploitable.
 */

const stripAccents = (value: string): string =>
  value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/** Clé de comparaison : minuscules, sans accents ni séparateurs. */
export const comparableKey = (value: unknown): string =>
  stripAccents(String(value ?? ''))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

export const isBlank = (value: unknown): boolean =>
  value === undefined ||
  value === null ||
  (typeof value === 'string' && value.trim() === '');

const TRUE_WORDS = new Set([
  'true',
  '1',
  'oui',
  'yes',
  'y',
  'o',
  'vrai',
  'actif',
  'active',
  'on',
  'x',
]);
const FALSE_WORDS = new Set([
  'false',
  '0',
  'non',
  'no',
  'n',
  'faux',
  'inactif',
  'inactive',
  'off',
]);

export function parseLenientBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value !== 'string') return null;
  const v = stripAccents(value).trim().toLowerCase();
  if (TRUE_WORDS.has(v)) return true;
  if (FALSE_WORDS.has(v)) return false;
  return null;
}

const MULTIPLIERS: Array<[RegExp, number]> = [
  [/(milliards?|mds?)$/, 1e9],
  [/(millions?|mio)$/, 1e6],
  [/k$/, 1e3],
];

/** Unités recopiées après un nombre (« 60 min », « 2 h », « 30 jours »). */
const UNIT_SUFFIX =
  /(minutes?|mins?|mn|heures?|hrs?|h|jours?|j|days?|semaines?|mois|ans?|annees?|years?|points?|pts?)$/;

/**
 * « 1 500 000 FCFA » → 1500000, « 1,5 » → 1.5, « 12 % » → 12,
 * « 1.500.000 » → 1500000, « 2,5 millions » → 2500000.
 * Une virgule seule est lue comme séparateur décimal (usage français).
 */
export function parseLenientNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value !== 'string') return null;

  let s = stripAccents(value)
    .toLowerCase()
    .replace(/[\s\u00a0\u202f']/g, '')
    .replace(/(fcfa|cfa|xaf|xof|eur|euros?|usd|dollars?|francs?|f)$/, '')
    .replace(/[€$%]/g, '');
  if (/\d/.test(s)) s = s.replace(UNIT_SUFFIX, '');
  if (!s) return null;

  let multiplier = 1;
  for (const [pattern, factor] of MULTIPLIERS) {
    if (pattern.test(s)) {
      s = s.replace(pattern, '');
      multiplier = factor;
      break;
    }
  }

  const negative = s.startsWith('-');
  s = s.replace(/^[+-]/, '');
  if (!/^[\d.,]+$/.test(s)) return null;

  const commas = (s.match(/,/g) || []).length;
  const dots = (s.match(/\./g) || []).length;
  if (commas && dots) {
    // Le dernier séparateur rencontré est le séparateur décimal.
    const decimal = s.lastIndexOf(',') > s.lastIndexOf('.') ? ',' : '.';
    const thousands = decimal === ',' ? '.' : ',';
    s = s.split(thousands).join('').replace(decimal, '.');
  } else if (commas > 1) {
    s = s.split(',').join('');
  } else if (commas === 1) {
    s = s.replace(',', '.');
  } else if (dots > 1) {
    s = s.split('.').join('');
  }

  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return (negative ? -n : n) * multiplier;
}

const pad = (n: number): string => String(n).padStart(2, '0');

const formatDate = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const MONTHS: Record<string, number> = {
  janvier: 1,
  january: 1,
  jan: 1,
  janv: 1,
  fevrier: 2,
  february: 2,
  feb: 2,
  fev: 2,
  fevr: 2,
  mars: 3,
  march: 3,
  mar: 3,
  avril: 4,
  april: 4,
  apr: 4,
  avr: 4,
  mai: 5,
  may: 5,
  juin: 6,
  june: 6,
  jun: 6,
  juillet: 7,
  july: 7,
  jul: 7,
  juil: 7,
  aout: 8,
  august: 8,
  aug: 8,
  septembre: 9,
  september: 9,
  sep: 9,
  sept: 9,
  octobre: 10,
  october: 10,
  oct: 10,
  novembre: 11,
  november: 11,
  nov: 11,
  decembre: 12,
  december: 12,
  dec: 12,
};

const RELATIVE_DAYS: Record<string, number> = {
  aujourdhui: 0,
  today: 0,
  maintenant: 0,
  now: 0,
  demain: 1,
  tomorrow: 1,
  apresdemain: 2,
  hier: -1,
  yesterday: -1,
  avanthier: -2,
};

function buildDate(
  year: number,
  month: number,
  day: number,
  time?: string | null,
): string | null {
  if (year < 100) year += 2000;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(year, month - 1, day);
  if (d.getMonth() !== month - 1) return null; // ex: 31/02
  if (!time) return formatDate(d);
  return `${formatDate(d)} ${time.length === 5 ? `${time}:00` : time}`;
}

/**
 * « 14h30 » → « 14:30 », « 9h » → « 09:00 », « 14:30:00 » → « 14:30:00 ».
 */
export function parseLenientTime(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const m = String(value)
    .trim()
    .toLowerCase()
    .match(/^(\d{1,2})\s*(?:[h:.]\s*(\d{2})?)?(?::(\d{2}))?$/);
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = Number(m[2] ?? 0);
  if (hours > 23 || minutes > 59) return null;
  const seconds = m[3] !== undefined ? Number(m[3]) : null;
  if (seconds !== null && seconds > 59) return null;
  return `${pad(hours)}:${pad(minutes)}${seconds !== null ? `:${pad(seconds)}` : ''}`;
}

/**
 * Convertit les formes courantes en date ISO (« YYYY-MM-DD », suivie de
 * « HH:MM:SS » si une heure est présente) :
 *   « 15/06/2026 », « 15-06-26 », « 15 juin 2026 », « 1er juillet 2026 »,
 *   « aujourd'hui », « demain », « 2026-06-15T09:00 »…
 */
export function parseLenientDate(value: unknown): string | Date | null {
  if (value instanceof Date)
    return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw) return null;

  // Déjà au format ISO : on garde tel quel (pas de décalage de fuseau).
  if (/^\d{4}-\d{1,2}-\d{1,2}([ T].*)?$/.test(raw)) {
    const [y, mo, d] = raw.slice(0, 10).split(/-/).map(Number);
    return buildDate(y, mo, d) ? raw : null;
  }

  const relative = RELATIVE_DAYS[comparableKey(raw)];
  if (relative !== undefined) {
    const d = new Date();
    d.setDate(d.getDate() + relative);
    return formatDate(d);
  }

  const timeOf = (rest?: string): string | null =>
    rest ? parseLenientTime(rest.replace(/^[\s,àa]+/i, '')) : null;

  // JJ/MM/AAAA (ordre français), séparateurs / . -
  const numeric = raw.match(
    /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(?:[\sT,]+(?:a|à)?\s*(.+))?$/i,
  );
  if (numeric) {
    return buildDate(
      Number(numeric[3]),
      Number(numeric[2]),
      Number(numeric[1]),
      timeOf(numeric[4]),
    );
  }

  // « 15 juin 2026 », « 1er juillet 2026 à 14h »
  const named = stripAccents(raw)
    .toLowerCase()
    .match(
      /^(\d{1,2})(?:er)?\s+([a-z]+)\.?\s+(\d{2,4})(?:[\s,]+(?:a\s+)?(.+))?$/,
    );
  if (named && MONTHS[named[2]]) {
    return buildDate(
      Number(named[3]),
      MONTHS[named[2]],
      Number(named[1]),
      timeOf(named[4]),
    );
  }

  // Dernier recours (« June 15, 2026 »…) seulement avec une année explicite :
  // new Date('12') serait lu comme le 1er décembre 2001.
  if (!/\d{4}/.test(raw)) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : formatDate(parsed);
}

/**
 * Retrouve la valeur d'énumération correspondant à ce que le LLM a écrit :
 * la valeur elle-même (« 0 », « HIGH »), le nom de la clé (« SCHEDULED »),
 * sans tenir compte de la casse, des accents ni des séparateurs.
 * `enumObject` est l'enum TypeScript d'origine quand il est connu.
 */
export function matchEnumValue(
  value: unknown,
  enumValues: Array<string | number>,
  enumObject?: Record<string, string | number>,
): string | number | undefined {
  if (value === undefined || value === null) return undefined;
  if (enumValues.includes(value as any)) return value as any;

  const numericValues = enumValues.every((v) => typeof v === 'number');
  if (numericValues) {
    const n = parseLenientNumber(value);
    if (n !== null && enumValues.includes(n)) return n;
  }

  const key = comparableKey(value);
  if (!key) return undefined;
  const byValue = enumValues.find((v) => comparableKey(v) === key);
  if (byValue !== undefined) return byValue;

  if (enumObject) {
    for (const [name, v] of Object.entries(enumObject)) {
      if (/^\d+$/.test(name)) continue; // entrées inverses des enums numériques
      if (comparableKey(name) === key && enumValues.includes(v)) return v;
    }
  }
  return undefined;
}
