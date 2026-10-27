import { SetMetadata } from '@nestjs/common';

/**
 * Marque une route de l'espace plateforme (`/platform/*`).
 *
 * Ces routes sont authentifiées par le jeton plateforme (PlatformAuthGuard),
 * jamais par le jeton cabinet : le guard JWT global (PublicGuard) et le
 * SuspendedCabinetGuard les ignorent. Utiliser `@PlatformRoute()` du module
 * plateforme, qui pose cette metadata ET les guards plateforme.
 */
export const IS_PLATFORM_KEY = 'isPlatformRoute';
export const MarkPlatformRoute = () => SetMetadata(IS_PLATFORM_KEY, true);

/** Préfixe d'URL de l'espace plateforme (le middleware tenant l'ignore). */
export const PLATFORM_PATH_PREFIX = '/platform';
