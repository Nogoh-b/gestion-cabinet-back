/**
 * Jointures d'enrichissement vers une table que l'utilisateur ne peut pas lire
 * (ex. `user` pour afficher le responsable d'une action) : retirées de la
 * requête IA, pour qu'une question qui n'a pas besoin de ces colonnes reste
 * répondable au lieu d'être refusée en entier. Seules les jointures sans effet
 * sur le reste de la requête sont retirées : LEFT JOIN sur la clé primaire de la
 * table, alias utilisé seulement dans le SELECT. Dans les autres cas, `null` :
 * la requête reste telle quelle et le refus habituel s'applique.
 * Fonctions pures, testées dans denied-join-pruning.spec.ts.
 */

/** Même longueur que le SQL d'origine : commentaires et chaînes remplacés par des espaces. */
function maskSql(sql: string): string {
  return sql
    .replace(/--[^\n]*/g, (match) => ' '.repeat(match.length))
    .replace(/\/\*[\s\S]*?\*\//g, (match) => ' '.repeat(match.length))
    .replace(
      /'((?:[^'\\]|\\.|'')*)'/g,
      (match) => `'${' '.repeat(match.length - 2)}'`,
    )
    .replace(
      /"((?:[^"\\]|\\.)*)"/g,
      (match) => `"${' '.repeat(match.length - 2)}"`,
    );
}

function isWordStart(text: string, index: number): boolean {
  return index === 0 || !/\w/.test(text[index - 1]);
}

/** Dernier segment d'un identifiant (`dbname.user` → `user`, `` `user` `` → `user`). */
function lastName(identifier: string): string {
  return (identifier.replace(/`/g, '').split('.').pop() ?? '')
    .trim()
    .toLowerCase();
}

/** Fin de la clause ON : mot-clé de clause, `;` ou `)` fermante, au niveau 0. */
function onClauseEnd(masked: string, from: number): number {
  const clauseKeyword =
    /(?:LEFT|RIGHT|FULL|INNER|CROSS|NATURAL|STRAIGHT_JOIN|JOIN|WHERE|GROUP|ORDER|HAVING|LIMIT|UNION|WINDOW|FOR|LOCK|INTO)\b/iy;
  let depth = 0;
  for (let index = from; index < masked.length; index++) {
    const char = masked[index];
    if (char === '(') {
      depth++;
    } else if (char === ')') {
      if (depth === 0) return index;
      depth--;
    } else if (depth === 0) {
      if (char === ';') return index;
      if (isWordStart(masked, index)) {
        clauseKeyword.lastIndex = index;
        if (clauseKeyword.test(masked)) return index;
      }
    }
  }
  return masked.length;
}

/** Éléments du SELECT (virgules de niveau 0) et position du FROM de niveau 0. */
function selectItems(
  masked: string,
  listStart: number,
): { items: Array<{ start: number; end: number }>; fromAt: number } | null {
  const fromKeyword = /FROM\b/iy;
  const items: Array<{ start: number; end: number }> = [];
  let depth = 0;
  let itemStart = listStart;
  for (let index = listStart; index < masked.length; index++) {
    const char = masked[index];
    if (char === '(') {
      depth++;
    } else if (char === ')') {
      depth--;
    } else if (depth === 0) {
      if (char === ',') {
        items.push({ start: itemStart, end: index });
        itemStart = index + 1;
      } else if (isWordStart(masked, index)) {
        fromKeyword.lastIndex = index;
        if (fromKeyword.test(masked)) {
          items.push({ start: itemStart, end: index });
          return { items, fromAt: index };
        }
      }
    }
  }
  return null;
}

/**
 * SQL sans les LEFT JOIN vers les `deniedTables` (noms de tables en minuscules),
 * et sans les colonnes du SELECT qui en dépendaient. `null` si cela n'est pas
 * possible sans changer le sens de la requête.
 */
export function pruneDeniedJoins(
  sql: string,
  deniedTables: string[],
): string | null {
  const denied = new Set(deniedTables.map((table) => table.toLowerCase()));
  const masked = maskSql(sql);
  const joinPattern =
    /\b((?:(?:LEFT|RIGHT|FULL|INNER|CROSS|NATURAL)\s+)?(?:OUTER\s+)?JOIN)\s+(`?\w+`?(?:\s*\.\s*`?\w+`?)?)(?:\s+(?:AS\s+)?(`?\w+`?))?\s+ON\s+/gi;

  const removed: Array<{
    start: number;
    end: number;
    table: string;
    alias: string;
  }> = [];
  let match: RegExpExecArray | null;
  while ((match = joinPattern.exec(masked)) !== null) {
    const table = lastName(match[2]);
    if (!denied.has(table)) continue;
    // INNER JOIN : il filtre les lignes sans correspondance, le retirer changerait le résultat.
    if (!/^LEFT\b/i.test(match[1])) return null;

    const alias = match[3] ? lastName(match[3]) : table;
    const onStart = match.index + match[0].length;
    const onEnd = onClauseEnd(masked, onStart);
    // Lookup sur la clé primaire : une ligne au plus par enregistrement, donc retirer la jointure
    // ne duplique ni ne supprime aucune ligne.
    const primaryKey = new RegExp(
      `\\b${alias}\\.id\\s*=|=\\s*${alias}\\.id\\b`,
      'i',
    );
    if (!primaryKey.test(masked.slice(onStart, onEnd))) return null;

    removed.push({ start: match.index, end: onEnd, table, alias });
    joinPattern.lastIndex = onEnd;
  }
  if (!removed.length) return null;

  const head = /^\s*SELECT\s+(?:(?:DISTINCT|ALL)\s+)?/i.exec(masked);
  if (!head) return null;
  const list = selectItems(masked, head[0].length);
  if (!list) return null;
  const fromAt = list.fromAt;
  if (removed.some((join) => join.start < fromAt)) return null;

  const names = new Set<string>();
  for (const join of removed) {
    names.add(join.alias);
    names.add(join.table);
  }
  const mentionsRemoved = (text: string) =>
    Array.from(names).some((name) =>
      new RegExp(`\\b${name}\\b`, 'i').test(text),
    );

  const kept: string[] = [];
  const droppedAliases: string[] = [];
  for (const item of list.items) {
    const text = masked.slice(item.start, item.end).trim();
    if (!text) continue;
    // « SELECT * » ramènerait aussi les colonnes de la jointure retirée.
    if (text === '*') return null;
    if (mentionsRemoved(text)) {
      const explicitAlias = /\bAS\s+`?(\w+)`?$/i.exec(text);
      if (explicitAlias) droppedAliases.push(explicitAlias[1].toLowerCase());
      continue;
    }
    kept.push(sql.slice(item.start, item.end).trim());
  }
  if (!kept.length) return null;

  let tail = '';
  let cursor = fromAt;
  for (const join of removed) {
    tail += sql.slice(cursor, join.start);
    cursor = join.end;
  }
  tail += sql.slice(cursor);
  const pruned = `${sql.slice(0, head[0].length)}${kept.join(', ')} ${tail}`;

  // Plus aucune référence aux tables, alias ou colonnes retirés (WHERE, ORDER BY, autres ON…).
  const maskedPruned = maskSql(pruned);
  const leftovers = [...names, ...droppedAliases];
  if (
    leftovers.some((name) =>
      new RegExp(`\\b${name}\\b`, 'i').test(maskedPruned),
    )
  ) {
    return null;
  }
  return pruned;
}
