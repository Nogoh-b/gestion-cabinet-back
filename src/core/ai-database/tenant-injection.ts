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
  'where', 'on', 'set', 'limit', 'order', 'group', 'having', 'union', 'left',
  'right', 'inner', 'outer', 'cross', 'join', 'select', 'from', 'and', 'or',
  'not', 'in', 'is', 'null', 'like', 'between', 'exists', 'case', 'when',
  'then', 'else', 'end', 'as', 'by', 'asc', 'desc', 'distinct', 'all', 'any',
  'into', 'values', 'insert', 'update', 'delete', 'create', 'drop', 'alter',
  'index', 'table', 'view', 'using', 'straight_join', 'natural',
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
      const parentMasked = opened.length > 0 && opened[opened.length - 1].masked;
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

export interface TenantInjectionOptions {
  tenantId: number;
  /** Tables qui ont une colonne tenant_id (en minuscules). */
  tenantTables: Set<string>;
  /** Référentiels partagés : tenant_id IN (1, X). */
  sharedTables?: Set<string>;
}

/** Ajoute le filtre cabinet à chaque niveau de la requête. */
export function injectTenantFilter(
  sql: string,
  options: TenantInjectionOptions,
): string {
  if (!options.tenantId || options.tenantId === 1) return sql;
  if (options.tenantTables.size === 0) return sql;
  // Le niveau principal est toujours filtré, même s'il commence par WITH.
  return processNested(sql, options, true);
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
    result = result.slice(0, start) + processNested(inner, options) + result.slice(end);
  }
  return root || /^\s*select\b/i.test(result) ? injectSelect(result, options) : result;
}

/** SELECT d'un seul niveau (UNION : chaque branche reçoit son filtre). */
function injectSelect(sql: string, options: TenantInjectionOptions): string {
  const masked = maskNested(sql);
  const unionRe = /\bUNION(?:\s+ALL|\s+DISTINCT)?\b/gi;
  const cuts: Array<[number, number]> = [];
  let u: RegExpExecArray | null;
  while ((u = unionRe.exec(masked)) !== null) cuts.push([u.index, u.index + u[0].length]);
  if (cuts.length === 0) return injectScope(sql, options);
  let out = '';
  let from = 0;
  for (const [at, after] of cuts) {
    out += injectScope(sql.slice(from, at), options) + sql.slice(at, after);
    from = after;
  }
  return out + injectScope(sql.slice(from), options);
}

function injectScope(sql: string, options: TenantInjectionOptions): string {
  const { tenantId, tenantTables } = options;
  const sharedTables = options.sharedTables ?? new Set<string>();
  const masked = maskNested(sql);

  const resolveAlias = (table: string, captured?: string) => {
    const raw = captured?.toLowerCase();
    return raw && !SQL_KEYWORDS.has(raw) ? raw : table;
  };

  const aliasMap = new Map<string, string>();
  const outerAliases = new Set<string>();
  const innerAliases = new Set<string>();
  const fromRe = /\bFROM\s+`?(\w+)`?(?:\s+(?:AS\s+)?([a-zA-Z_]\w*))?\b/gi;
  let m: RegExpExecArray | null;
  while ((m = fromRe.exec(masked)) !== null) {
    const table = m[1].toLowerCase();
    if (!tenantTables.has(table)) continue;
    const alias = resolveAlias(table, m[2]);
    aliasMap.set(alias, table);
    innerAliases.add(alias);
  }
  const joinRe =
    /\b(?:(LEFT|RIGHT)(?:\s+OUTER)?\s+)?JOIN\s+`?(\w+)`?(?:\s+(?:AS\s+)?([a-zA-Z_]\w*))?\b/gi;
  while ((m = joinRe.exec(masked)) !== null) {
    const table = m[2].toLowerCase();
    if (!tenantTables.has(table)) continue;
    const alias = resolveAlias(table, m[3]);
    aliasMap.set(alias, table);
    (m[1] ? outerAliases : innerAliases).add(alias);
  }
  if (aliasMap.size === 0) return sql;

  // Idempotence : la bonne condition est déjà écrite à ce niveau (ON, WHERE).
  const ownLevel = maskNested(sql, true);
  const conditions = Array.from(aliasMap.entries())
    .map(([alias, table]) => {
      const isShared = sharedTables.has(table);
      const already = isShared
        ? new RegExp(`\\b${alias}\\.tenant_id\\s+IN\\s*\\(\\s*1\\s*,\\s*${tenantId}\\s*\\)`, 'i')
        : new RegExp(`\\b${alias}\\.tenant_id\\s*=\\s*${tenantId}\\b`, 'i');
      if (already.test(ownLevel)) return null;
      const condition = isShared
        ? `${alias}.tenant_id IN (1, ${tenantId})`
        : `${alias}.tenant_id = ${tenantId}`;
      // Jointure externe sans correspondance : colonnes NULL. tenant_id est
      // NOT NULL partout, donc un NULL ne vient que de l'absence de ligne liée
      // et une ligne d'un autre cabinet reste exclue.
      return outerAliases.has(alias) && !innerAliases.has(alias)
        ? `(${condition} OR ${alias}.tenant_id IS NULL)`
        : condition;
    })
    .filter((c): c is string => c !== null);
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
