import { SetMetadata } from '@nestjs/common';

/**
 * Ouvre une route authentifiée aux comptes du portail client (rôle `client`).
 *
 * Les comptes client sont refusés par défaut (403) sur toute route non
 * publique : la plupart des contrôleurs ne vérifient que des permissions et ne
 * filtrent pas par `req.user.customerId` (cf. assertClientRouteAllowed, appelé
 * par PublicGuard). Ne poser ce décorateur que sur une route qui ne renvoie au
 * client que ses propres données.
 */
export const ALLOW_CLIENT_KEY = 'allowClient';
export const AllowClient = () => SetMetadata(ALLOW_CLIENT_KEY, true);
