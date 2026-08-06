const LOOPBACK_DEV_ORIGIN =
  /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d{1,5})?$/;

/**
 * En développement, Next.js peut basculer automatiquement de 3000 vers 3001
 * (ou un autre port) si le port demandé est déjà occupé.
 *
 * Les origines distantes restent interdites sauf si elles sont explicitement
 * déclarées dans CORS_ORIGINS. En production, aucune exception loopback n'est
 * appliquée.
 */
export function isCorsOriginAllowed(
  origin: string | undefined,
  allowedOrigins: readonly string[],
  isProduction: boolean,
): boolean {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  return !isProduction && LOOPBACK_DEV_ORIGIN.test(origin);
}
