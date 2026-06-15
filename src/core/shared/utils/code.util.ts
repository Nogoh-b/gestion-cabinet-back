/**
 * Génération automatique de codes / références pour les ressources.
 *
 * Utilisé lorsqu'un utilisateur ne fournit pas de code à la création : le back
 * en génère un, lisible et raisonnablement unique (slug du nom + suffixe
 * aléatoire). Les champs `code` sont donc devenus facultatifs côté formulaire.
 */

/** Translitère un libellé en slug MAJUSCULE sûr (A-Z, 0-9, underscore). */
function slugify(input: string, maxLen = 12): string {
  return (input || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // retire les accents
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, maxLen);
}

/** Suffixe aléatoire alphanumérique (majuscule) de `len` caractères. */
function randomSuffix(len = 4): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let out = '';
  for (let i = 0; i < len; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

/**
 * Génère un code automatique.
 * @param prefix   Préfixe par défaut quand aucun nom n'est exploitable (ex: "JUR").
 * @param name     Libellé source pour le slug (ex: nom de la juridiction).
 * @param sep      Séparateur entre slug et suffixe ("_" par défaut — compatible
 *                 avec les patterns `[A-Z0-9_]`).
 *
 * Exemples : generateEntityCode("JUR", "Tribunal de Yaoundé") → "TRIBUNAL_DE_A1B2"
 *            generateEntityCode("PLAN")                        → "PLAN_A1B2"
 */
export function generateEntityCode(
  prefix: string,
  name?: string,
  sep: string = '_',
): string {
  const base = slugify(name ?? '') || prefix.toUpperCase();
  return `${base}${sep}${randomSuffix(4)}`;
}
