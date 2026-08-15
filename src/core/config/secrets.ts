/**
 * secrets.ts — garde-fou centralisé pour les secrets applicatifs.
 *
 * Règle d'or : un secret ne doit JAMAIS avoir de valeur par défaut codée en dur.
 * En production, l'absence ou la faiblesse d'un secret doit faire échouer le
 * démarrage (fail-fast) plutôt que de risquer d'utiliser une valeur devinable.
 *
 * Utilisation :
 *   import { requireSecret } from 'src/core/config/secrets';
 *   const jwtSecret = requireSecret('JWT_SECRET');
 */

/** Longueur minimale acceptable pour un secret (en caractères). */
const MIN_SECRET_LENGTH = 24;

/**
 * Liste des secrets considérés comme « faibles / devinables ».
 * Issus des anciens fallbacks codés en dur du projet — à ne jamais accepter,
 * même en développement, car ils ont pu fuiter.
 */
const KNOWN_WEAK_SECRETS = new Set([
  'secretKey',
  'defaultSecretKey',
  'ma_clé_secrète_super_sécurisée',
  'super_secret_key',
  'secret',
  'changeme',
]);

/**
 * Retourne la valeur d'une variable d'environnement obligatoire.
 *
 * - Lance une erreur fatale si la variable est absente en production.
 * - En développement, émet un avertissement mais conserve un comportement
 *   permissif (affichage clair dans la console) pour ne pas bloquer le
 *   `nest start --watch` local.
 *
 * @param key   Nom de la variable d'environnement (ex: 'JWT_SECRET').
 * @param value Valeur brute lue depuis process.env.
 */
export function requireSecret(key: string, value: string | undefined): string {
  const isProd = process.env.NODE_ENV === 'production';

  if (!value || !value.trim()) {
    if (isProd) {
      throw new Error(
        `[SECURITE] Secret obligatoire manquant : "${key}". ` +
          `Définissez-le avant de démarrer en production.`,
      );
    }
    console.warn(
      `\n⚠️  [SECURITE] Secret "${key}" non défini — mode développement permissif.\n` +
        `    NE JAMAIS utiliser cette configuration en production.\n`,
    );
    return '';
  }

  if (KNOWN_WEAK_SECRETS.has(value)) {
    if (isProd) {
      throw new Error(
        `[SECURITE] Secret "${key}" trop faible (valeur par défaut connue). ` +
          `Générez un secret d'au moins ${MIN_SECRET_LENGTH} caractères aléatoires.`,
      );
    }
    console.warn(
      `\n⚠️  [SECURITE] Secret "${key}" = valeur faible connue. À remplacer.\n`,
    );
  }

  if (isProd && value.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `[SECURITE] Secret "${key}" trop court (${value.length} < ${MIN_SECRET_LENGTH}). ` +
        `En production, exigez au moins ${MIN_SECRET_LENGTH} caractères.`,
    );
  }

  return value;
}

/** Raccourci pour le secret JWT, utilisé en plusieurs endroits. */
export function getJwtSecret(): string {
  return requireSecret('JWT_SECRET', process.env.JWT_SECRET);
}
