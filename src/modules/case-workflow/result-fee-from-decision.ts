/**
 * HONORAIRE DE RÉSULTAT DÉCLENCHÉ PAR LA DÉCISION — lit, dans le texte d'une
 * décision favorable, le montant obtenu qui sert de base à l'honoraire de
 * résultat prévu par la convention (profil de facturation du dossier).
 */

/** Issues qui ouvrent droit à l'honoraire de résultat. */
export const WINNING_OUTCOMES = ['favorable', 'partial'];

export function isWinningOutcome(outcome?: string | null): boolean {
  return WINNING_OUTCOMES.includes(String(outcome ?? '').trim().toLowerCase());
}

const AMOUNT =
  /(\d{1,3}(?:[ .  ]\d{3})+|\d{4,})(?:[,.]\d{1,2})?\s*(?:F\s*CFA|FCFA|XAF|francs?\s*CFA|F\b)/gi;

/**
 * Montant obtenu d'après le dispositif : celui qualifié « en principal » s'il
 * existe, sinon le premier montant en FCFA. `null` si aucun montant lisible.
 */
export function principalAmountFromDecision(text?: string | null): number | null {
  const plain = String(text ?? '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ');
  const principals = [...plain.matchAll(/principal/gi)].map((match) => match.index ?? 0);
  const amounts: Array<{ value: number; distance: number }> = [];
  for (const match of plain.matchAll(AMOUNT)) {
    const value = Number(match[1].replace(/[ .  ]/g, ''));
    if (!Number.isFinite(value) || value <= 0) continue;
    const start = match.index ?? 0;
    const end = start + match[0].length;
    // Distance au mot « principal » le plus proche (avant ou après le montant).
    const distance = Math.min(
      Infinity,
      ...principals.map((at) => (at >= end ? at - end : at < start ? start - at : 0)),
    );
    amounts.push({ value, distance });
  }
  if (!amounts.length) return null;
  const closest = amounts.reduce((best, amount) => (amount.distance < best.distance ? amount : best));
  return closest.distance <= 40 ? closest.value : amounts[0].value;
}
