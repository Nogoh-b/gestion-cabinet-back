/**
 * Requête de lecture IA revenue vide alors qu'elle vise UN enregistrement
 * précis (« synthèse du dossier DOS-2026-0039 ») : le plus souvent, une
 * jointure interne vers une table annexe sans correspondance (dossier sans
 * juridiction, sans action…) a supprimé la ligne. On la relance une fois avec
 * ces jointures en LEFT JOIN. Fonctions pures, testées dans
 * outer-join-fallback.spec.ts.
 */

/** Morceaux hors chaînes SQL ('…'), seuls à transformer. */
function mapOutsideStrings(sql: string, transform: (code: string) => string): string {
  return sql
    .split(/('(?:[^'\\]|\\.|'')*')/)
    .map((part, index) => (index % 2 === 1 ? part : transform(part)))
    .join('');
}

/**
 * La requête désigne un enregistrement précis : égalité sur un identifiant
 * métier (« = 'DOS-2026-0039' », numero/reference/…_number) ou sur une clé
 * (`d.id = 94`, `dossier_id = 94`).
 */
export function targetsSpecificRecord(sql: string): boolean {
  const where = sql.split(/\bWHERE\b/i).slice(1).join(' WHERE ');
  if (!where) return false;
  return (
    /\b(?:\w+\.)?(?:id|\w+_id)\s*=\s*\d+\b/i.test(where) ||
    /\b(?:\w+\.)?(?:numero|reference|code|\w+_number|\w+_reference)\s*(?:=|LIKE)\s*'[^']+'/i.test(where) ||
    /=\s*'[A-Za-z]{1,6}[-/.]?\d{2,}[-/.\w]*'/.test(where)
  );
}

/**
 * Même requête avec chaque JOIN / INNER JOIN en LEFT JOIN, ou `null` quand il
 * n'y a rien à élargir. LEFT/RIGHT/FULL/CROSS/NATURAL JOIN sont gardés.
 */
export function widenInnerJoins(sql: string): string | null {
  let changed = false;
  const widened = mapOutsideStrings(sql, (code) =>
    code.replace(
      /\b(?:(LEFT|RIGHT|FULL|CROSS|NATURAL|OUTER|STRAIGHT_JOIN)\s+)?(?:INNER\s+)?JOIN\b/gi,
      (whole, kept: string | undefined) => {
        if (kept) return whole;
        changed = true;
        return 'LEFT JOIN';
      },
    ),
  );
  return changed ? widened : null;
}

/** Requête de repli à tenter après un résultat vide, ou `null`. */
export function outerJoinRetry(sql: string): string | null {
  if (!targetsSpecificRecord(sql)) return null;
  return widenInnerJoins(sql);
}
