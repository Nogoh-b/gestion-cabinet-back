import { FindOptionsWhere } from 'typeorm';

import { businessRole } from 'src/core/auth/business-role';
import { UserRole } from 'src/core/enums/user-role.enum';
import { Dossier } from './entities/dossier.entity';

/** Appelant tel que le porte le JWT (cf. JwtStrategy.validate). */
export interface DossierScopeUser {
  id?: number | null;
  role?: string | null;
  base_role?: string | null;
  customerId?: number | null;
}

/**
 * PORTÉE DES DOSSIERS SELON LE RÔLE — à fusionner dans CHAQUE branche d'un
 * `where` TypeORM (un tableau `where` est un OU) :
 *   - avocat : ses propres dossiers (avocat responsable) ;
 *   - client : les dossiers de son customerId ;
 *   - autres rôles (admin, secrétariat…) : aucune restriction.
 *
 * Elle s'ajoute à la confidentialité (DossierVisibilityPatch) sans la
 * remplacer. Listes de dossiers et export ZIP passent par ici, afin que la
 * règle ne diverge pas d'un écran à l'autre.
 */
export function dossierRoleScope(
  user: DossierScopeUser | null | undefined,
): FindOptionsWhere<Dossier> {
  // Avocat : ses propres dossiers (Employee partage la clé de User). Sans
  // identifiant, aucun résultat : un `id` undefined serait ignoré par TypeORM.
  if (businessRole(user) === UserRole.AVOCAT) {
    return { lawyer: { id: user?.id ?? -1 } };
  }

  return dossierClientScope(user);
}

/** Client : uniquement ses propres dossiers. */
export function dossierClientScope(
  user: DossierScopeUser | null | undefined,
): FindOptionsWhere<Dossier> {
  if (user?.role !== UserRole.CLIENT) return {};

  // Aucun résultat si le jeton ne porte pas de customerId.
  return { client_id: user.customerId || -1 };
}
