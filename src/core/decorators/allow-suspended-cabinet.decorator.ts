import { SetMetadata } from '@nestjs/common';

export const ALLOW_SUSPENDED_CABINET_KEY = 'allowSuspendedCabinet';

/**
 * Autorise une route authentifiée à rester accessible lorsque l'abonnement
 * du cabinet est suspendu. Cette exemption ne désactive ni l'authentification
 * ni les contrôles de permission.
 */
export const AllowSuspendedCabinet = () =>
  SetMetadata(ALLOW_SUSPENDED_CABINET_KEY, true);
