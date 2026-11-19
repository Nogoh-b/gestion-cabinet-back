import type { CheckResult, EvalQuestion, MentionCheck, TurnResult, ValueKind } from './eval-types';

/** Minuscules, sans accents, espaces insécables normalisés, espaces fusionnés. */
export function normalizeText(text: unknown): string {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[\u00a0\u202f\u2009]/g, ' ')
    .replace(/[’`]/g, "'")
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const NUMBER_WORDS: Record<string, number> = {
  aucun: 0, aucune: 0, zero: 0, un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5,
  six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12,
};

/**
 * Nombres écrits dans un texte français : « 1 250 000 », « 1.250.000 »,
 * « 1 250 000,50 », « 1250000.5 », « 1,25 million », « 3 M FCFA ».
 */
export function extractNumbers(text: string): number[] {
  const source = String(text ?? '').replace(/[\u00a0\u202f\u2009]/g, ' ');
  const numbers: number[] = [];
  const re =
    /(?<![\d.,])(-?\d{1,3}(?:[ .]\d{3})+(?:,\d+)?|-?\d+(?:[.,]\d+)?)(?![\d])(?:\s*(milliards?|millions?|mds?|m)\b)?/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    let token = match[1];
    if (/^-?\d{1,3}( \d{3})+(,\d+)?$/.test(token) || /^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(token)) {
      // Séparateurs de milliers (espace ou point), décimales après la virgule.
      token = token.replace(/[ .]/g, '').replace(',', '.');
    } else {
      token = token.replace(',', '.');
    }
    let value = Number(token);
    if (!Number.isFinite(value)) continue;
    const unit = match[2]?.toLowerCase();
    if (unit?.startsWith('milliard') || unit === 'md' || unit === 'mds') value *= 1e9;
    else if (unit?.startsWith('million') || unit === 'm') value *= 1e6;
    numbers.push(value);
    // « 1 250 000 » : le plus long nombre l'emporte, ses morceaux ne sont pas
    // relus. Un « 2026 » isolé reste un nombre.
  }
  return numbers;
}

export function amountMentioned(answer: string, expected: number): boolean {
  if (!Number.isFinite(expected)) return false;
  const tolerance = Math.max(1, Math.abs(expected) * 0.005);
  return extractNumbers(answer).some((value) => Math.abs(Math.abs(value) - Math.abs(expected)) <= tolerance);
}

export function countMentioned(answer: string, expected: number): boolean {
  if (extractNumbers(answer).some((value) => value === expected)) return true;
  const words = normalizeText(answer).split(/[^a-z]+/);
  return words.some((word) => NUMBER_WORDS[word] === expected);
}

const MONTHS = [
  'janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre',
];

/** `2026-11-05` (ou Date) → formes acceptées dans une réponse en français. */
export function dateForms(value: unknown): string[] {
  const iso =
    value instanceof Date
      ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
      : String(value ?? '');
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return [normalizeText(iso)];
  const [, y, m, d] = match;
  const day = Number(d);
  const month = MONTHS[Number(m) - 1];
  const dayWord = day === 1 ? '(?:1er|1)' : String(day);
  return [
    `${d}/${m}/${y}`,
    `${day}/${Number(m)}/${y}`,
    `${d}/${m}/${y.slice(2)}`,
    `${y}-${m}-${d}`,
    `${d}-${m}-${y}`,
    `${d}.${m}.${y}`,
    // « 5 novembre 2026 », « 5 novembre » (année implicite), « 1er mars ».
    `re:\\b${dayWord}\\s+${month}\\b`,
  ];
}

export function dateMentioned(answer: string, value: unknown): boolean {
  const text = normalizeText(answer);
  return dateForms(value).some((form) =>
    form.startsWith('re:') ? new RegExp(form.slice(3)).test(text) : text.includes(form),
  );
}

/**
 * Valeur interdite citée telle quelle (mot entier) : « C1 » n'est pas trouvé
 * dans « C10 », contrairement à une simple inclusion.
 */
export function exactTokenMentioned(answer: string, value: unknown): boolean {
  const needle = normalizeText(value);
  if (!needle) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`).test(normalizeText(answer));
}

export function textMentioned(answer: string, value: unknown): boolean {
  const needle = normalizeText(value);
  if (!needle) return true;
  return normalizeText(answer).includes(needle);
}

export function valueMentioned(answer: string, value: unknown, kind: ValueKind = 'text'): boolean {
  if (value === null || value === undefined || value === '') return true;
  switch (kind) {
    case 'amount':
      return amountMentioned(answer, Number(value));
    case 'count':
      return countMentioned(answer, Number(value));
    case 'date':
      return dateMentioned(answer, value);
    case 'pattern':
      return new RegExp(String(value), 'i').test(normalizeText(answer));
    default:
      return textMentioned(answer, value);
  }
}

/** Question qui propose un choix à l'utilisateur. */
export const CLARIFICATION_PATTERN =
  /\b(lequel|laquelle|lesquel(le)?s|precise[rz]?|preciser|de quel|quel (dossier|client)|plusieurs (dossiers|clients)|s'agit-il|vouliez-vous|voulez-vous dire|choisi(r|ssez))\b/;

/** Expressions (normalisées) qui disent qu'il n'y a rien, ou que l'élément est introuvable. */
export const ABSENCE_PATTERN =
  /\b(aucun|aucune|pas de|pas d'|n'existe|introuvable|ne trouve|n'ai trouve|pas trouve|n'a ete trouve|rien|zero|0 (facture|dossier|audience|action|paiement|element))/;

function pass(name: string, ok: boolean, detail?: string): CheckResult {
  return { name, ok, score: ok ? 1 : 0, ...(detail && { detail }) };
}

/** Seuil de réussite des mentions : tout pour 3 valeurs ou moins, 80 % au-delà. */
export function mentionThreshold(expected: number): number {
  return expected <= 3 ? 1 : 0.8;
}

export interface ScoreInput {
  question: EvalQuestion;
  turn: TurnResult;
  referenceRows?: Array<Record<string, unknown>>;
  forbiddenValues?: string[];
}

/** Vérifications d'une réponse. La question réussit si toutes passent. */
export function scoreTurn({ question, turn, referenceRows, forbiddenValues = [] }: ScoreInput): CheckResult[] {
  const { expect } = question;
  const answer = turn.answer ?? '';
  const normalized = normalizeText(answer);
  const checks: CheckResult[] = [];

  checks.push(pass('sans erreur', !turn.error, turn.error));

  if (expect.intent?.length) {
    checks.push(
      pass(
        'intention',
        !!turn.intent && expect.intent.includes(turn.intent),
        `attendu ${expect.intent.join('|')}, obtenu ${turn.intent ?? 'aucune'}`,
      ),
    );
  }

  if (expect.skill?.length) {
    const launched = turn.skills ?? [];
    checks.push(
      pass(
        'compétence',
        launched.some((code) => expect.skill!.includes(code)),
        `attendu ${expect.skill.join('|')}, lancé ${launched.join(', ') || 'aucune'}`,
      ),
    );
  }

  if (expect.clarification) {
    // Demande de précision : événement dédié, ou question qui propose un choix.
    const asks = turn.clarification || (/\?/.test(answer) && CLARIFICATION_PATTERN.test(normalized));
    checks.push(pass('demande de précision', asks, 'la cible est ambiguë : l’assistant doit demander laquelle'));
  }

  if (expect.confirmation !== undefined) {
    checks.push(
      pass('confirmation demandée', turn.confirmation === expect.confirmation, turn.confirmation ? 'confirmation' : 'aucune confirmation'),
    );
  }

  const rows = referenceRows ?? [];
  const emptyTruth = !!question.reference && rows.length === 0;
  if (expect.absenceWhenEmpty && (emptyTruth || !question.reference)) {
    checks.push(pass('dit qu’il n’y a rien', ABSENCE_PATTERN.test(normalized), 'la vérité est vide : la réponse doit le dire'));
  } else if (expect.mentions?.length && rows.length) {
    checks.push(mentionCheck(answer, rows, expect.mentions));
  }

  if (expect.require?.length) {
    const found = expect.require.some((pattern) => new RegExp(pattern, 'i').test(normalized));
    checks.push(pass('contenu attendu', found, `une de : ${expect.require.join(' | ')}`));
  }

  const forbiddenPatterns = (expect.forbid ?? []).filter((pattern) => new RegExp(pattern, 'i').test(normalized));
  const leaked = forbiddenValues.filter((value) => exactTokenMentioned(answer, value));
  if (expect.forbid?.length || forbiddenValues.length) {
    checks.push(
      pass(
        'rien d’interdit',
        !forbiddenPatterns.length && !leaked.length,
        [...forbiddenPatterns.map((p) => `motif ${p}`), ...leaked.map((v) => `valeur ${v}`)].join(', ') || undefined,
      ),
    );
  }

  return checks;
}

function mentionCheck(answer: string, rows: Array<Record<string, unknown>>, mentions: MentionCheck[]): CheckResult {
  let expected = 0;
  let found = 0;
  const missing: string[] = [];
  for (const mention of mentions) {
    for (const row of rows.slice(0, mention.max ?? 10)) {
      const value = row[mention.column];
      if (value === null || value === undefined || value === '') continue;
      expected++;
      if (valueMentioned(answer, value, mention.kind)) found++;
      else if (missing.length < 6) missing.push(`${mention.column}=${String(value)}`);
    }
  }
  if (!expected) return pass('données exactes', true, 'aucune valeur attendue');
  const score = found / expected;
  return {
    name: 'données exactes',
    ok: score >= mentionThreshold(expected),
    score,
    detail: `${found}/${expected} valeurs citées${missing.length ? ` — manquent : ${missing.join(', ')}` : ''}`,
  };
}

/** Score d'une question : moyenne de ses vérifications ; réussie si toutes passent. */
export function summarizeChecks(checks: CheckResult[]): { ok: boolean; score: number } {
  if (!checks.length) return { ok: false, score: 0 };
  return {
    ok: checks.every((check) => check.ok),
    score: checks.reduce((sum, check) => sum + check.score, 0) / checks.length,
  };
}

/** `{param}` → valeur (texte des questions). */
export function fillTemplate(template: string, params: Record<string, unknown>): string {
  return template.replace(/\{(\w+)\}/g, (whole, name) => (name in params ? String(params[name]) : whole));
}

/**
 * Requête de référence : `:tenant` et `{param}` deviennent des paramètres
 * liés (`?`), jamais concaténés dans le SQL.
 */
export function bindSql(sql: string, params: Record<string, unknown>): { sql: string; values: unknown[] } {
  const values: unknown[] = [];
  const bound = sql.replace(/:tenant\b|\{(\w+)\}/g, (whole, name?: string) => {
    if (!name) {
      values.push(params.tenant);
      return '?';
    }
    if (!(name in params)) throw new Error(`Paramètre {${name}} absent`);
    values.push(params[name]);
    return '?';
  });
  return { sql: bound, values };
}
