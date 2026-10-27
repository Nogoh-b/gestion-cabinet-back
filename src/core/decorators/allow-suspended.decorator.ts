import { SetMetadata } from '@nestjs/common';

/**
 * Autorise une route authentifiée à rester accessible lorsque le cabinet est
 * suspendu (par exemple pour consulter ou renouveler l'abonnement).
 *
 * Contrairement à @Public(), cette métadonnée ne désactive pas le JWT :
 * req.user reste donc disponible pour résoudre le tenant courant.
 */
export const ALLOW_SUSPENDED_KEY = 'allowSuspended';
export const AllowSuspended = () => SetMetadata(ALLOW_SUSPENDED_KEY, true);
