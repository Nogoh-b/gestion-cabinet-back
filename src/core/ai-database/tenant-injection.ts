/**
 * Filtre cabinet (tenant_id) ajouté aux requêtes de lecture générées par l'IA.
 *
 * Chaque niveau de requête est traité séparément : une sous-requête
 * `(SELECT COUNT(*) FROM dossier_actions da WHERE …)` reçoit ses conditions
 * dans son propre WHERE, et le WHERE / LIMIT de la requête principale sont
 * cherchés hors parenthèses. Avant, le premier WHERE du texte (celui de la
 * sous-requête) était pris pour le WHERE principal : la parenthèse ouverte
 * dans la sous-requête se fermait en fin de requête → SQL invalide → réponse
 * « aucune donnée ». Fonctions pures, testées dans tenant-injection.spec.ts.
 */

/** Mots-clés SQL qui ne peuvent pas être des alias de table. */
export const SQL_KEYWORDS = new Set([
  'where',
  'on',
  'set',
  'limit',
  'order',
  'group',
  'having',
  'union',
  'left',
  'right',
  'inner',
  'outer',
  'cross',
  'join',
  'select',
  'from',
  'and',
  'or',
  'not',
  'in',
  'is',
  'null',
  'like',
  'between',
  'exists',
  'case',
  'when',
  'then',
  'else',
  'end',
  'as',
  'by',
  'asc',
  'desc',
  'distinct',
  'all',
  'any',
  'into',
  'values',
  'insert',
  'update',
  'delete',
  'create',
  'drop',
  'alter',
  'index',
  'table',
  'view',
  'using',
  'straight_join',
  'natural',
]);

/**
 * Même longueur que `sql`, avec les chaînes et le contenu des parenthèses
 * remplacés par des espaces : seuls les mots du niveau courant restent.
 * `subqueriesOnly` ne masque que les parenthèses qui contiennent un SELECT.
 */
export function maskNested(sql: string, subqueriesOnly = false): string {
  const out = sql.split('');
  let quote: string | null = null;
  const opened: Array<{ at: number; masked: boolean }> = [];
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (quote) {
      out[i] = ' ';
      if (ch === '\\') {
        if (i + 1 < sql.length) out[++i] = ' ';
      } else if (ch === quote) {
        if (sql[i + 1] === quote) out[++i] = ' ';
        else quote = null;
      }
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      out[i] = ' ';
      continue;
    }
    if (ch === '(') {
      const parentMasked =
        opened.length > 0 && opened[opened.length - 1].masked;
      const masked =
        parentMasked ||
        !subqueriesOnly ||
        /^\s*select\b/i.test(sql.slice(i + 1, i + 40));
      opened.push({ at: i, masked });
      if (parentMasked) out[i] = ' ';
      continue;
    }
    if (ch === ')') {
      opened.pop();
      if (opened.length > 0 && opened[opened.length - 1].masked) out[i] = ' ';
      continue;
    }
    if (opened.length > 0 && opened[opened.length - 1].masked) out[i] = ' ';
  }
  return out.join('');
}

/**
 * Retire les commentaires SQL (`-- …`, `# …`, `/* … *\/`, y compris les
 * commentaires exécutables `/*! … *\/` de MySQL) hors des chaînes et des
 * identifiants entre backticks. MySQL lit un commentaire comme un espace :
 * `FROM/**\/factures` échappait au filtre cabinet, et le contenu d'un
 * `/*! … *\/` était exécuté sans être contrôlé.
 */
export function stripSqlComments(sql: string): string {
  let out = '';
  let quote: string | null = null;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (quote) {
      out += ch;
      if (ch === '\\' && quote !== '`') {
        if (i + 1 < sql.length) out += sql[++i];
      } else if (ch === quote) {
        if (sql[i + 1] === quote) out += sql[++i];
        else quote = null;
      }
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      out += ch;
      continue;
    }
    if (ch === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2);
      i = end === -1 ? sql.length : end + 1;
      out += ' ';
      continue;
    }
    // `--` n'ouvre un commentaire que suivi d'un espace ou en fin de texte
    // (`5--1` vaut 5 - -1).
    const dashComment =
      ch === '-' && sql[i + 1] === '-' && (i + 2 >= sql.length || /\s/.test(sql[i + 2]));
    if (ch === '#' || dashComment) {
      const end = sql.indexOf('\n', i);
      i = end === -1 ? sql.length : end - 1;
      out += ' ';
      continue;
    }
    out += ch;
  }
  return out;
}

/** Table lue dans une autre base que celle de l'application. */
export class ForeignSchemaError extends Error {
  constructor(readonly schema: string) {
    super(`Lecture hors de la base de l'application refusée (${schema}).`);
    this.name = 'ForeignSchemaError';
  }
}

/** Même longueur que `sql`, avec le contenu des chaînes remplacé par des espaces. */
function maskLiterals(sql: string): string {
  return sql.replace(
    /'(?:[^'\\]|\\.|'')*'|"(?:[^"\\]|\\.|"")*"/g,
    (literal) => literal[0] + ' '.repeat(literal.length - 2) + literal[literal.length - 1],
  );
}

/**
 * Tables qualifiées par leur base (`kabysoft.factures f`) : le filtre cabinet
 * ne reconnaissait que les noms simples, une table qualifiée était donc lue
 * pour tous les cabinets. La base de l'application est retirée (la table
 * redevient filtrable) ; toute autre base (information_schema, mysql, autre
 * application) est refusée par ForeignSchemaError.
 */
export function normalizeQualifiedTables(
  sql: string,
  currentDatabase?: string | null,
): string {
  const masked = maskLiterals(sql);
  const segmentRe =
    /\b(?:FROM|JOIN)\s+([^;()]*?)(?=\b(?:WHERE|GROUP|ORDER|LIMIT|HAVING|UNION|ON|USING|LEFT|RIGHT|INNER|OUTER|CROSS|NATURAL|STRAIGHT_JOIN|JOIN|WINDOW|FOR|LOCK|INTO)\b|[;()]|$)/gi;
  const prefixes: Array<[number, number]> = [];
  let segment: RegExpExecArray | null;
  while ((segment = segmentRe.exec(masked)) !== null) {
    let offset = segment.index + segment[0].length - segment[1].length;
    for (const item of segment[1].split(',')) {
      const qualified = /^(\s*)(`?)([a-zA-Z_$][\w$]*)\2\s*\.\s*(?=`?[a-zA-Z_$])/.exec(item);
      if (qualified) {
        const schema = qualified[3];
        if (!currentDatabase || schema.toLowerCase() !== currentDatabase.toLowerCase()) {
          throw new ForeignSchemaError(schema);
        }
        const start = offset + qualified[1].length;
        prefixes.push([start, offset + qualified[0].length]);
      }
      offset += item.length + 1;
    }
  }
  let result = sql;
  for (const [start, end] of prefixes.sort((a, b) => b[0] - a[0])) {
    result = result.slice(0, start) + result.slice(end);
  }
  return result;
}

/** Groupes de parenthèses de premier niveau : [début du contenu, fin exclue]. */
function topLevelGroups(sql: string): Array<[number, number]> {
  const groups: Array<[number, number]> = [];
  let quote: string | null = null;
  let depth = 0;
  let start = -1;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) {
        if (sql[i + 1] === quote) i++;
        else quote = null;
      }
      continue;
    }
    if (ch === "'" || ch === '"') quote = ch;
    else if (ch === '(') {
      if (depth++ === 0) start = i + 1;
    } else if (ch === ')' && depth > 0) {
      if (--depth === 0) groups.push([start, i]);
    }
  }
  return groups;
}

/**
 * Filtre d'une table qui n'est pas (seulement) rattachée par tenant_id :
 * `cabinets.id = X`, `subscriptions.cabinet_id = X`, `notifications.user_id = U`,
 * ou `mails.to` contenant l'adresse de l'utilisateur (`listContains`).
 */
export interface ScopeCondition {
  column: string;
  value: number | string;
  match?: 'equals' | 'listContains';
}

export interface TenantInjectionOptions {
  tenantId: number;
  /** Tables qui ont une colonne tenant_id (en minuscules). */
  tenantTables: Set<string>;
  /** Référentiels partagés : tenant_id IN (1, X). */
  sharedTables?: Set<string>;
  /**
   * Tables à suppression logique (colonne deleted_at) : une ligne supprimée
   * n'apparaît jamais dans une réponse ni dans un total de l'assistant.
   * Appliqué à tous les cabinets, cabinet 1 compris.
   */
  softDeleteTables?: Set<string>;
  /**
   * Filtres propres à certaines tables (en minuscules), appliqués même pour
   * le cabinet 1 : une table sans tenant_id (cabinets, abonnements) ne doit
   * jamais montrer la ligne d'un autre cabinet.
   */
  scopedTables?: Map<string, ScopeCondition[]>;
}

/** Ajoute le filtre cabinet à chaque niveau de la requête. */
export function injectTenantFilter(
  sql: string,
  options: TenantInjectionOptions,
): string {
  const tenantActive =
    !!options.tenantId &&
    options.tenantId !== 1 &&
    options.tenantTables.size > 0;
  if (
    !tenantActive &&
    !options.scopedTables?.size &&
    !options.softDeleteTables?.size
  )
    return sql;
  // Le niveau principal est toujours filtré, même s'il commence par WITH.
  return processNested(sql, options, true);
}

/** Littéral SQL sûr : entier, ou chaîne échappée. */
function scopeLiteral(value: number | string): string {
  if (typeof value === 'number')
    return String(Number.isInteger(value) ? value : 0);
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
}

function scopeConditionSql(alias: string, scope: ScopeCondition): string {
  const column = `${alias}.\`${scope.column.replace(/`/g, '')}\``;
  return scope.match === 'listContains'
    ? `FIND_IN_SET(${scopeLiteral(scope.value)}, REPLACE(${column}, ' ', '')) > 0`
    : `${column} = ${scopeLiteral(scope.value)}`;
}

/** Condition déjà écrite à ce niveau (idempotence). */
function scopeAlreadyApplied(
  alias: string,
  scope: ScopeCondition,
  sql: string,
  ownLevel: string,
): boolean {
  if (scope.match === 'listContains')
    return sql.includes(scopeConditionSql(alias, scope));
  return new RegExp(
    `\\b${alias}\\.\`?${scope.column}\`?\\s*=\\s*${scopeLiteral(scope.value)}(?![\\w.])`,
    'i',
  ).test(ownLevel);
}

/** Traite les sous-requêtes contenues dans `text`, puis `text` s'il est un SELECT. */
function processNested(
  text: string,
  options: TenantInjectionOptions,
  root = false,
): string {
  let result = text;
  // De droite à gauche : les positions des groupes précédents restent valides.
  for (const [start, end] of topLevelGroups(text).reverse()) {
    const inner = result.slice(start, end);
    result =
      result.slice(0, start) +
      processNested(inner, options) +
      result.slice(end);
  }
  return root || /^\s*select\b/i.test(result)
    ? injectSelect(result, options)
    : result;
}

function softDeleteCondition(alias: string): string {
  return `${alias}.deleted_at IS NULL`;
}

function softDeleteApplied(alias: string, ownLevel: string): boolean {
  return new RegExp(`\\b${alias}\\.\`?deleted_at\`?\\s+IS\\s+NULL\\b`, 'i').test(ownLevel);
}

const NOT_AN_ALIAS =
  /^(?:ON|USING|WHERE|LEFT|RIGHT|INNER|OUTER|CROSS|NATURAL|STRAIGHT_JOIN|JOIN|GROUP|ORDER|LIMIT|HAVING|UNION|WINDOW|FOR|LOCK)$/i;

/**
 * Suppression logique sur une jointure externe : la condition va dans le ON
 * (`LEFT JOIN factures f ON (f.dossier_id = d.id) AND f.deleted_at IS NULL`).
 * Dans le WHERE, un dossier dont toutes les factures sont supprimées
 * disparaîtrait au lieu d'apparaître avec 0 facture.
 */
function softDeleteOuterJoins(sql: string, options: TenantInjectionOptions): string {
  const softDeleteTables = options.softDeleteTables;
  if (!softDeleteTables?.size) return sql;
  const masked = maskNested(sql);
  const joinRe =
    /\b(?:LEFT|RIGHT)(?:\s+OUTER)?\s+JOIN\s+(?:`?\w+`?\s*\.\s*)?`?(\w+)`?(?:\s+(?:AS\s+)?([a-zA-Z_]\w*))?/gi;
  const edits: Array<{ start: number; end: number; text: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = joinRe.exec(masked)) !== null) {
    const table = m[1].toLowerCase();
    let matchEnd = m.index + m[0].length;
    let alias: string | undefined = m[2];
    if (alias && NOT_AN_ALIAS.test(alias)) {
      matchEnd -= alias.length;
      alias = undefined;
    }
    joinRe.lastIndex = matchEnd;
    if (!softDeleteTables.has(table)) continue;
    const on = /^\s*ON\b/i.exec(masked.slice(matchEnd));
    if (!on) continue;
    const condStart = matchEnd + on[0].length;
    const next = /\b(?:LEFT|RIGHT|INNER|CROSS|NATURAL|STRAIGHT_JOIN|JOIN|WHERE|GROUP\s+BY|HAVING|ORDER\s+BY|LIMIT|UNION|WINDOW)\b|;/i.exec(
      masked.slice(condStart),
    );
    const condEnd = next ? condStart + next.index : sql.length;
    const condition = sql.slice(condStart, condEnd);
    const name = alias ?? m[1];
    if (softDeleteApplied(name, maskNested(condition, true))) continue;
    const trailing = /\s*$/.exec(condition)?.[0] ?? '';
    edits.push({
      start: condStart,
      end: condEnd,
      text: ` (${condition.trim()}) AND ${softDeleteCondition(name)}${trailing || (next ? ' ' : '')}`,
    });
  }
  let result = sql;
  for (const edit of edits.reverse()) {
    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
  }
  return result;
}

/** SELECT d'un seul niveau (UNION : chaque branche reçoit son filtre). */
function injectSelect(sql: string, options: TenantInjectionOptions): string {
  const masked = maskNested(sql);
  const unionRe = /\bUNION(?:\s+ALL|\s+DISTINCT)?\b/gi;
  const cuts: Array<[number, number]> = [];
  let u: RegExpExecArray | null;
  while ((u = unionRe.exec(masked)) !== null)
    cuts.push([u.index, u.index + u[0].length]);
  if (cuts.length === 0) return injectScope(softDeleteOuterJoins(sql, options), options);
  let out = '';
  let from = 0;
  for (const [at, after] of cuts) {
    out +=
      injectScope(softDeleteOuterJoins(sql.slice(from, at), options), options) +
      sql.slice(at, after);
    from = after;
  }
  return out + injectScope(softDeleteOuterJoins(sql.slice(from), options), options);
}

function injectScope(sql: string, options: TenantInjectionOptions): string {
  const { tenantId } = options;
  const tenantActive = !!tenantId && tenantId !== 1;
  const tenantTables = tenantActive ? options.tenantTables : new Set<string>();
  const scopedTables =
    options.scopedTables ?? new Map<string, ScopeCondition[]>();
  const softDeleteTables = options.softDeleteTables ?? new Set<string>();
  const isFiltered = (table: string) =>
    tenantTables.has(table) ||
    scopedTables.has(table) ||
    softDeleteTables.has(table);
  const sharedTables = options.sharedTables ?? new Set<string>();
  const masked = maskNested(sql);

  const resolveAlias = (table: string, captured?: string) => {
    // Casse d'origine : sous MariaDB/Linux, les alias y sont sensibles.
    return captured && !SQL_KEYWORDS.has(captured.toLowerCase()) ? captured : table;
  };

  const aliasMap = new Map<string, string>();
  const outerAliases = new Set<string>();
  const innerAliases = new Set<string>();
  // Toute la liste du FROM : « FROM dossiers d, cabinets c » filtre aussi la
  // seconde table (jointure implicite), pas seulement la première.
  const fromRe =
    /\bFROM\s+([\s\S]*?)(?=\b(?:WHERE|GROUP|HAVING|ORDER|LIMIT|UNION|LEFT|RIGHT|INNER|OUTER|CROSS|NATURAL|STRAIGHT_JOIN|JOIN|ON|USING|WINDOW|FOR|LOCK)\b|;|$)/gi;
  let m: RegExpExecArray | null;
  while ((m = fromRe.exec(masked)) !== null) {
    for (const item of m[1].split(',')) {
      const name = /^\s*(?:`?\w+`?\s*\.\s*)?`?(\w+)`?(?:\s+(?:AS\s+)?([a-zA-Z_]\w*))?/i.exec(item);
      if (!name) continue;
      const table = name[1].toLowerCase();
      if (!isFiltered(table)) continue;
      const alias = resolveAlias(table, name[2]);
      aliasMap.set(alias, table);
      innerAliases.add(alias);
    }
  }
  const joinRe =
    /\b(?:(LEFT|RIGHT)(?:\s+OUTER)?\s+)?JOIN\s+(?:`?\w+`?\s*\.\s*)?`?(\w+)`?(?:\s+(?:AS\s+)?([a-zA-Z_]\w*))?\b/gi;
  while ((m = joinRe.exec(masked)) !== null) {
    const table = m[2].toLowerCase();
    if (!isFiltered(table)) continue;
    const alias = resolveAlias(table, m[3]);
    aliasMap.set(alias, table);
    (m[1] ? outerAliases : innerAliases).add(alias);
  }
  if (aliasMap.size === 0) return sql;

  // Idempotence : la bonne condition est déjà écrite à ce niveau (ON, WHERE).
  const ownLevel = maskNested(sql, true);
  const outerOnly = (alias: string) =>
    outerAliases.has(alias) && !innerAliases.has(alias);
  const scopeConditions = Array.from(aliasMap.entries()).flatMap(
    ([alias, table]) =>
      (scopedTables.get(table) ?? [])
        .filter((scope) => !scopeAlreadyApplied(alias, scope, sql, ownLevel))
        .map((scope) => {
          const condition = scopeConditionSql(alias, scope);
          // Jointure externe sans ligne liée : la clé primaire (NOT NULL) est NULL.
          return outerOnly(alias)
            ? `(${condition} OR ${alias}.id IS NULL)`
            : condition;
        }),
  );
  const conditions = Array.from(aliasMap.entries())
    .filter(([, table]) => tenantTables.has(table))
    .map(([alias, table]) => {
      const isShared = sharedTables.has(table);
      const already = isShared
        ? new RegExp(
            `\\b${alias}\\.tenant_id\\s+IN\\s*\\(\\s*1\\s*,\\s*${tenantId}\\s*\\)`,
            'i',
          )
        : new RegExp(`\\b${alias}\\.tenant_id\\s*=\\s*${tenantId}\\b`, 'i');
      if (already.test(ownLevel)) return null;
      const condition = isShared
        ? `${alias}.tenant_id IN (1, ${tenantId})`
        : `${alias}.tenant_id = ${tenantId}`;
      // Jointure externe sans correspondance : colonnes NULL. tenant_id est
      // NOT NULL partout, donc un NULL ne vient que de l'absence de ligne liée
      // et une ligne d'un autre cabinet reste exclue.
      return outerOnly(alias)
        ? `(${condition} OR ${alias}.tenant_id IS NULL)`
        : condition;
    })
    .filter((c): c is string => c !== null)
    .concat(scopeConditions)
    .concat(
      // Jointure externe : la condition est déjà dans son ON
      // (softDeleteOuterJoins) pour ne pas écarter la ligne principale.
      Array.from(aliasMap.entries())
        .filter(([alias, table]) => softDeleteTables.has(table) && !outerOnly(alias))
        .filter(([alias]) => !softDeleteApplied(alias, ownLevel))
        .map(([alias]) => softDeleteCondition(alias)),
    );
  if (conditions.length === 0) return sql;
  const filter = conditions.join(' AND ');

  // Fin des conditions : premier GROUP BY / HAVING / ORDER BY / LIMIT de ce
  // niveau, sinon fin de la requête (hors « ; » et espaces finaux).
  const tail = /\s*;?\s*$/.exec(sql);
  const bodyEnd = tail ? tail.index : sql.length;
  const where = /\bWHERE\b/i.exec(masked);
  const clauseRe = /\b(?:GROUP\s+BY|HAVING|ORDER\s+BY|LIMIT)\b/gi;
  clauseRe.lastIndex = where ? where.index + where[0].length : 0;
  const clause = clauseRe.exec(masked);
  const clauseAt = clause && clause.index < bodyEnd ? clause.index : bodyEnd;

  if (where) {
    // `(existant) AND (filtre)` : un OR existant ne contourne pas le filtre.
    const condStart = where.index + where[0].length;
    const existing = sql.slice(condStart, clauseAt).trim();
    const gap = clauseAt < bodyEnd ? '\n' : '';
    return `${sql.slice(0, where.index)}WHERE (${existing}) AND (${filter})${gap}${sql.slice(clauseAt)}`;
  }
  if (clauseAt < bodyEnd) {
    return `${sql.slice(0, clauseAt)}WHERE ${filter}\n${sql.slice(clauseAt)}`;
  }
  return `${sql.slice(0, bodyEnd).trimEnd()} WHERE ${filter}${sql.slice(bodyEnd)}`;
}
