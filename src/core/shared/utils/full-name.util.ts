/**
 * Découpage d'un nom complet en { first_name, last_name }.
 *
 * Miroir du helper frontend (`client-quick-create.helpers.ts`) : un seul mot
 * est traité comme un nom de famille (le plus probable en recherche comme en
 * saisie rapide) ; plusieurs mots → premier mot = prénom, reste = nom.
 */
export function splitFullName(fullName: string | null | undefined): {
  first_name: string;
  last_name: string;
} {
  const parts = (fullName ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first_name: '', last_name: '' };
  if (parts.length === 1) return { first_name: '', last_name: parts[0] };
  return { first_name: parts[0], last_name: parts.slice(1).join(' ') };
}

/** Concatène prénom et nom en un nom complet, en ignorant les parties vides. */
export function joinFullName(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
): string {
  return [firstName, lastName]
    .map((part) => (part ?? '').trim())
    .filter(Boolean)
    .join(' ');
}

/**
 * Base d'identifiant de connexion dérivée d'un nom complet, pour les comptes
 * créés sans email (création minimale employé — uniquement `full_name`).
 * Minuscules, sans accents, mots séparés par un point ; repli sur "membre"
 * si le nom ne contient aucun caractère alphanumérique.
 * L'appelant est responsable de garantir l'unicité (suffixe numérique).
 */
export function generateUsernameBase(
  fullName: string | null | undefined,
): string {
  const base = (fullName ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .join('.')
    .replace(/[^a-z0-9.]/g, '');
  return base || 'membre';
}
