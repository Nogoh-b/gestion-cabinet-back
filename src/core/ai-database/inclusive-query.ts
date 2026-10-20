/**
 * Requêtes de lecture IA « inclusives » : une requête trop restrictive renvoie
 * zéro ligne alors que les données existent, et le chat répond « aucune
 * donnée ». Cas réel (2026-10-19) : « factures impayées ou partiellement
 * payées de DOS-2026-0038 avec le nombre de jours de retard ». Le retard,
 * demandé comme information, était devenu un filtre (échéances encore à venir).
 * `montant_ttc - SUM(paiements)` valait NULL pour une facture sans paiement.
 *
 *  - `coalesceSums` : SUM(…) → COALESCE(SUM(…), 0), toujours sûr pour un total ;
 *  - `inclusiveRetryInstruction` : consigne de la relance unique après un
 *    résultat vide ;
 *  - `keepsAnchors` : la relance garde les enregistrements cités (numéro,
 *    identifiant), sinon elle ramènerait les données d'autres dossiers.
 *
 * Fonctions pures, testées dans inclusive-query.spec.ts.
 */

/** Même longueur que `sql`, chaînes et commentaires remplacés par des espaces. */
function maskStrings(sql: string): string {
  return sql.replace(
    /'(?:\\.|''|[^'\\])*'|"(?:\\.|""|[^"\\])*"|--[^\n]*|\/\*[\s\S]*?\*\//g,
    (m) => ' '.repeat(m.length),
  );
}

/** Position de la parenthèse fermante qui répond à `open` (texte masqué), ou -1. */
function closingParen(masked: string, open: number): number {
  let depth = 0;
  for (let i = open; i < masked.length; i++) {
    if (masked[i] === '(') depth++;
    else if (masked[i] === ')' && --depth === 0) return i;
  }
  return -1;
}

/**
 * Chaque `SUM(x)` devient `COALESCE(SUM(x), 0)` : sans ligne liée (facture
 * sans paiement), SUM vaut NULL et toute soustraction ou comparaison qui
 * l'utilise aussi, ce qui fait disparaître la ligne. Inchangé quand la somme
 * est déjà dans COALESCE/IFNULL, sert une fenêtre (OVER) ou un test IS NULL.
 */
export function coalesceSums(sql: string): string {
  const masked = maskStrings(sql);
  const edits: Array<{ start: number; end: number }> = [];
  for (const match of masked.matchAll(/\bSUM\s*\(/gi)) {
    const start = match.index!;
    const open = start + match[0].length - 1;
    const end = closingParen(masked, open);
    if (end < 0) continue;
    const before = masked.slice(0, start);
    const after = masked.slice(end + 1);
    if (/\b(COALESCE|IFNULL|NVL)\s*\(\s*$/i.test(before)) continue;
    if (/^\s*(OVER\b|IS\s+(NOT\s+)?NULL\b)/i.test(after)) continue;
    edits.push({ start, end: end + 1 });
  }
  let out = sql;
  for (const { start, end } of edits.reverse()) {
    out = `${out.slice(0, start)}COALESCE(${out.slice(start, end)}, 0)${out.slice(end)}`;
  }
  return out;
}

/**
 * Ce que la requête cible précisément : numéros métier cités entre quotes
 * (« 'DOS-2026-0038' ») et identifiants comparés à une valeur fixe (`d.id = 90`).
 */
export function queryAnchors(sql: string): string[] {
  const anchors = new Set<string>();
  for (const m of sql.matchAll(/'([A-Za-z]{1,8}[-/.]?\d[\w\-/.]*)'/g)) anchors.add(m[1].toLowerCase());
  const code = maskStrings(sql);
  for (const m of code.matchAll(/\b(?:\w+\.)?(id|\w+_id)\s*=\s*(\d+)\b/gi)) {
    if (!/^tenant_id$/i.test(m[1])) anchors.add(`${m[1].toLowerCase()}=${m[2]}`);
  }
  return [...anchors];
}

/** La requête élargie vise-t-elle toujours les mêmes enregistrements précis ? */
export function keepsAnchors(original: string, retry: string): boolean {
  const kept = new Set(queryAnchors(retry));
  const retryText = retry.toLowerCase();
  return queryAnchors(original).every((anchor) =>
    anchor.includes('=') ? kept.has(anchor) : retryText.includes(`'${anchor}'`),
  );
}

/** Deux requêtes identiques aux espaces et à la casse près. */
export function sameQuery(a: string, b: string): boolean {
  const norm = (sql: string) => sql.replace(/;\s*$/, '').replace(/\s+/g, ' ').trim().toLowerCase();
  return norm(a) === norm(b);
}

/** Règles d'inclusivité communes au prompt SQL et à la relance. */
export const INCLUSIVE_SQL_RULES = `17. Requête INCLUSIVE : n'exclus aucune ligne que la question ne demande pas d'exclure.
   - N'ajoute AUCUN filtre (date, statut, montant, période) que la question n'impose pas explicitement.
   - Une information DEMANDÉE (jours de retard, reste dû, ancienneté, nombre…) est une COLONNE calculée, jamais un filtre : ex. GREATEST(DATEDIFF(CURDATE(), f.date_echeance), 0) AS jours_retard. Ne filtre sur le retard que si la question restreint aux éléments « en retard », « échus », « de plus de N jours ».
   - Totaux d'éléments liés (paiements d'une facture, actions d'un dossier) : sous-requête corrélée ou LEFT JOIN + GROUP BY, toujours COALESCE(SUM(...), 0). Une condition sur la table liée (ex: paiements validés) va dans la sous-requête ou dans le ON du LEFT JOIN, jamais dans le WHERE (sinon les lignes sans élément lié disparaissent).
   - Un état qui dépend des montants (impayé, soldé, partiellement payé) se calcule avec les montants, pas seulement avec un statut : un statut peut ne pas avoir été mis à jour.
   - Les colonnes ENUM à codes numériques se comparent entre quotes : f.status = '2', f.status IN ('1','2','4').`;

/** Consigne de la relance unique après un résultat vide. */
export function inclusiveRetryInstruction(question: string, sql: string): string {
  return `${question}

---
La requête ci-dessous a été exécutée pour cette question et n'a renvoyé AUCUNE ligne, alors que les données existent très probablement :
\`\`\`sql
${sql.trim()}
\`\`\`
Réécris UNE requête plus inclusive qui répond à la même question, en appliquant la règle 17 :
- garde OBLIGATOIREMENT les filtres sur les enregistrements cités (numéro de dossier, de facture, client, identifiant) et les critères que la question impose mot pour mot ;
- retire tout autre filtre (date, statut, montant) ; transforme les calculs demandés en colonnes ;
- LEFT JOIN pour les tables liées, COALESCE(SUM(...), 0), conditions sur les tables liées dans le ON ou dans une sous-requête.
Réponds uniquement avec le bloc SQL.`;
}
