/**
 * Colonnes ENUM à valeurs numériques (`dossiers.status` = enum('0'..'10'),
 * `danger_level` = enum('0'..'3')) comparées à un entier non quoté.
 *
 * MySQL compare alors l'ENUM à son index (1-based) et non à sa valeur :
 * `CASE d.status WHEN 0 THEN 'Ouvert' WHEN 1 THEN 'Analyse préliminaire'`
 * affiche « Analyse préliminaire » pour un dossier au statut '0'. Le LLM écrit
 * souvent ces entiers nus ; on les quote avant exécution :
 *   d.status = 0            → d.status = '0'
 *   d.status IN (8, 9)      → d.status IN ('8', '9')
 *   CASE d.status WHEN 0    → CASE d.status WHEN '0'
 *   d.status >= 8           → CAST(d.status AS CHAR) >= 8  (comparaison numérique
 *                             de la valeur : '10' >= '8' serait faux en texte)
 * Les chaînes et commentaires ne sont jamais modifiés. Fonctions pures, testées
 * dans numeric-enum-literals.spec.ts.
 */

/** table (minuscules) → colonnes ENUM dont toutes les valeurs sont des entiers. */
export type NumericEnumColumns = Map<string, Set<string>>;

/**
 * Construit la carte depuis les métadonnées TypeORM (`dataSource.entityMetadatas`).
 * Typé au plus juste pour rester testable sans DataSource.
 */
export function numericEnumColumnsFromMetadata(
  metas: ReadonlyArray<{
    tableName?: string;
    columns: ReadonlyArray<{
      type?: unknown;
      enum?: ReadonlyArray<unknown>;
      databaseName?: string;
    }>;
  }>,
): NumericEnumColumns {
  const result: NumericEnumColumns = new Map();
  for (const meta of metas) {
    if (!meta.tableName) continue;
    for (const col of meta.columns) {
      if (col.type !== 'enum' || !col.enum?.length || !col.databaseName) continue;
      if (!col.enum.every((v) => /^-?\d+$/.test(String(v)))) continue;
      const table = meta.tableName.toLowerCase();
      if (!result.has(table)) result.set(table, new Set());
      result.get(table)!.add(col.databaseName.toLowerCase());
    }
  }
  return result;
}

/**
 * Même longueur que `sql` : contenu des chaînes et commentaires remplacé par
 * des espaces (les guillemets restent), pour chercher les motifs sans jamais
 * toucher à ce qui est quoté.
 */
function maskLiterals(sql: string): string {
  const out = sql.split('');
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    if (ch === "'" || ch === '"') {
      i++;
      while (i < sql.length) {
        if (sql[i] === '\\' && i + 1 < sql.length) {
          out[i] = out[i + 1] = ' ';
          i += 2;
        } else if (sql[i] === ch) {
          if (sql[i + 1] === ch) {
            out[i] = out[i + 1] = ' ';
            i += 2;
          } else break;
        } else {
          out[i++] = ' ';
        }
      }
      i++;
    } else if (ch === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') out[i++] = ' ';
    } else if (ch === '#') {
      while (i < sql.length && sql[i] !== '\n') out[i++] = ' ';
    } else if (ch === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2);
      const stop = end === -1 ? sql.length : end + 2;
      while (i < stop) out[i++] = ' ';
    } else {
      i++;
    }
  }
  return out.join('');
}

/** alias (ou nom de table) → tables référencées dans la requête. */
function resolveAliases(
  masked: string,
  columns: NumericEnumColumns,
): Map<string, Set<string>> {
  const aliases = new Map<string, Set<string>>();
  const add = (alias: string, table: string) => {
    const key = alias.toLowerCase();
    if (!aliases.has(key)) aliases.set(key, new Set());
    aliases.get(key)!.add(table);
  };
  const re =
    /(?:\b(?:FROM|JOIN)\s+|,\s*)`?(\w+)`?(?:\s+(?:AS\s+)?`?([A-Za-z_]\w*)`?)?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(masked)) !== null) {
    const table = m[1].toLowerCase();
    if (!columns.has(table)) continue;
    add(table, table);
    if (m[2]) add(m[2], table);
  }
  return aliases;
}

interface Edit {
  start: number;
  end: number;
  text: string;
}

/** Référence de colonne `alias.col` ou `col` (backticks tolérés). */
const REF_BODY = '(?:`?([A-Za-z_]\\w*)`?\\s*\\.\\s*)?`?([A-Za-z_]\\w*)`?';
const REF = `(?<![\\w.\`])${REF_BODY}`;
const REF_AT_START = new RegExp(`^${REF_BODY}`);
/** Entier nu (pas un décimal, pas le début d'un identifiant). */
const INT = '(-?\\d+)(?![\\w.])';

/** Quote les entiers comparés aux colonnes ENUM numériques. */
export function quoteNumericEnumLiterals(
  sql: string,
  columns: NumericEnumColumns,
): string {
  if (columns.size === 0 || !/\d/.test(sql)) return sql;
  const masked = maskLiterals(sql);
  const aliases = resolveAliases(masked, columns);
  if (aliases.size === 0) return sql;

  const referenced = new Set<string>();
  for (const tables of aliases.values()) tables.forEach((t) => referenced.add(t));

  const isNumericEnum = (alias: string | undefined, column: string) => {
    const col = column.toLowerCase();
    const tables = alias ? aliases.get(alias.toLowerCase()) : referenced;
    if (!tables) return false;
    for (const t of tables) if (columns.get(t)?.has(col)) return true;
    return false;
  };

  const edits: Edit[] = [];
  const quote = (at: number, digits: string) =>
    edits.push({ start: at, end: at + digits.length, text: `'${digits}'` });
  /** Fin de la correspondance : l'entier capturé en dernier. */
  const quoteLast = (m: RegExpExecArray, digits: string) =>
    quote(m.index + m[0].length - digits.length, digits);

  // col = 0, col <> 0, col != 0, col <=> 0
  let m: RegExpExecArray | null;
  const eqRe = new RegExp(`${REF}\\s*(<=>|=|!=|<>)\\s*${INT}`, 'gi');
  while ((m = eqRe.exec(masked)) !== null) {
    if (isNumericEnum(m[1], m[2])) quoteLast(m, m[4]);
  }

  // 0 = col (ordre inversé)
  const revRe = new RegExp(
    `(?<![\\w.'"])(-?\\d+)\\s*(<=>|=|!=|<>)\\s*${REF_BODY}(?![\\w.(])`,
    'gi',
  );
  while ((m = revRe.exec(masked)) !== null) {
    if (isNumericEnum(m[3], m[4])) quote(m.index, m[1]);
  }

  // col IN (0, 1) / col NOT IN (0, 1) : listes de littéraux uniquement
  const inRe = new RegExp(`${REF}\\s+(?:NOT\\s+)?IN\\s*\\(([^()]*)\\)`, 'gi');
  while ((m = inRe.exec(masked)) !== null) {
    if (!isNumericEnum(m[1], m[2])) continue;
    if (!/^[\s\d,'"-]*$/.test(m[3])) continue;
    const listAt = m.index + m[0].lastIndexOf('(') + 1;
    const itemRe = /(?<![\w.'"])-?\d+(?![\w.'"])/g;
    let it: RegExpExecArray | null;
    while ((it = itemRe.exec(m[3])) !== null) quote(listAt + it.index, it[0]);
  }

  // col < 8, col BETWEEN 1 AND 3 : comparaison numérique de la valeur
  const castRef = (m: RegExpExecArray) => {
    const ref = REF_AT_START.exec(masked.slice(m.index));
    if (!ref) return;
    const text = sql.slice(m.index, m.index + ref[0].length);
    edits.push({
      start: m.index,
      end: m.index + text.length,
      text: `CAST(${text} AS CHAR)`,
    });
  };
  const rangeRe = new RegExp(`${REF}\\s*(?:<=(?!>)|>=|<(?![=>])|>(?!=))\\s*${INT}`, 'gi');
  while ((m = rangeRe.exec(masked)) !== null) {
    if (isNumericEnum(m[1], m[2])) castRef(m);
  }
  const betweenRe = new RegExp(`${REF}\\s+(?:NOT\\s+)?BETWEEN\\s+${INT}\\s+AND\\s+${INT}`, 'gi');
  while ((m = betweenRe.exec(masked)) !== null) {
    if (isNumericEnum(m[1], m[2])) castRef(m);
  }

  // CASE col WHEN 0 THEN … WHEN 1 THEN … END (CASE imbriqués ignorés)
  const caseRe = new RegExp(`\\bCASE\\s+${REF}\\s+(?=WHEN\\b)`, 'gi');
  while ((m = caseRe.exec(masked)) !== null) {
    if (!isNumericEnum(m[1], m[2])) continue;
    const tokenRe = /\bCASE\b|\bEND\b|\bWHEN\s+(-?\d+)(?![\w.])(?=\s+THEN\b)/gi;
    tokenRe.lastIndex = m.index + m[0].length;
    let depth = 0;
    let t: RegExpExecArray | null;
    while ((t = tokenRe.exec(masked)) !== null) {
      const word = t[0].toUpperCase();
      if (word === 'CASE') depth++;
      else if (word === 'END') {
        if (depth-- === 0) break;
      } else if (depth === 0 && t[1] !== undefined) {
        quote(t.index + t[0].length - t[1].length, t[1]);
      }
    }
  }

  if (edits.length === 0) return sql;
  // De droite à gauche, sans chevauchement (une même position n'est quotée qu'une fois).
  edits.sort((a, b) => b.start - a.start || b.end - a.end);
  let out = sql;
  let limit = sql.length;
  for (const e of edits) {
    if (e.end > limit) continue;
    out = out.slice(0, e.start) + e.text + out.slice(e.end);
    limit = e.start;
  }
  return out;
}
