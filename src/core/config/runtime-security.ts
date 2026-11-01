const UNSAFE_BIND_HOSTS = new Set(['0.0.0.0', '::', '[::]', '*']);

/**
 * Le transport Nest TCP ne comporte pas d'authentification applicative.
 * En production, il ne doit donc jamais ecouter sur toutes les interfaces.
 * Le pare-feu / network policy reste obligatoire pour l'adresse interne choisie.
 */
export function assertSafeMicroserviceBindHost(
  host: string,
  environment = process.env.NODE_ENV,
): void {
  if (
    environment === 'production' &&
    UNSAFE_BIND_HOSTS.has(String(host ?? '').trim().toLowerCase())
  ) {
    throw new Error(
      'MICROSERVICE_HOST doit cibler une interface interne explicite en production.',
    );
  }
}
