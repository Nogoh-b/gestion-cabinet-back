import { ForbiddenException } from '@nestjs/common';
import { DataSource, EntityManager, FindOptionsWhere, In } from 'typeorm';

import { UserRole } from 'src/core/enums/user-role.enum';
import { hasActiveTenant, runWithTenantContext } from 'src/core/tenant/tenant.context';
import { getCurrentRequestUser } from 'src/core/security/request-user.context';
import {
  ResourceActor,
  ResourcePolicyService,
} from 'src/core/resource-policy.service';
import { dossierClientScope } from './dossier-role-scope';
import { Dossier } from './entities/dossier.entity';
import { DossierMember } from './entities/dossier-member.entity';

/** Permission qui ouvre tous les dossiers du cabinet (hors confidentialité). */
export const VIEW_ALL_DOSSIERS = 'view_all_dossiers';

/** Appelant tel que le porte le JWT (cf. JwtStrategy.validate). */
export interface DossierAccessUser {
  id?: number | null;
  userId?: number | null;
  tenantId?: number | null;
  tenant_id?: number | null;
  role?: string | null;
  permissions?: string[] | null;
  customerId?: number | null;
}

/** Admin, super admin ou titulaire de « Voir tous les dossiers ». */
export function canSeeAllDossiers(user: DossierAccessUser | null | undefined): boolean {
  const permissions = user?.permissions ?? [];
  return (
    user?.role === UserRole.ADMIN ||
    permissions.includes('SUPER_ADMIN') ||
    permissions.includes(VIEW_ALL_DOSSIERS)
  );
}

export function toResourceActor(user: DossierAccessUser): ResourceActor {
  return {
    id: Number(user?.id),
    userId: Number(user?.userId ?? user?.id),
    tenantId: Number(user?.tenantId ?? user?.tenant_id),
    role: user?.role ?? undefined,
    permissions: Array.isArray(user?.permissions) ? user.permissions : [],
    customerId: user?.customerId ?? null,
  };
}

/** Identifiants des dossiers dont l'appelant est membre (ou responsable). */
export async function accessibleDossierIds(
  dataSource: DataSource,
  user: DossierAccessUser,
): Promise<number[]> {
  const actor = toResourceActor(user);
  const run = () => {
    const policy = new ResourcePolicyService(
      dataSource.getRepository(Dossier),
      dataSource.getRepository(DossierMember),
    );
    return policy.getAccessibleDossierIds(actor);
  };
  if (!hasActiveTenant() && Number.isInteger(actor.tenantId) && actor.tenantId > 0) {
    return runWithTenantContext(actor.tenantId, run);
  }
  return run();
}

/**
 * PORTÉE DES DOSSIERS PAR APPARTENANCE — à fusionner dans chaque branche d'un
 * `where` TypeORM :
 *   - client : ses propres dossiers ;
 *   - admin / « Voir tous les dossiers » : aucune restriction ;
 *   - personnel : les dossiers dont il est membre actif ou avocat responsable.
 * S'ajoute à la confidentialité (DossierVisibilityPatch) sans la remplacer.
 */
export async function dossierMembershipScope(
  dataSource: DataSource,
  user: DossierAccessUser | null | undefined,
): Promise<FindOptionsWhere<Dossier>> {
  if (user?.role === UserRole.CLIENT) return dossierClientScope(user);
  if (!user || canSeeAllDossiers(user)) return {};
  const ids = await accessibleDossierIds(dataSource, user);
  // Aucun dossier : un `In([])` serait ignoré, -1 ne correspond à rien.
  return { id: In(ids.length > 0 ? ids : [-1]) };
}

/** Vrai si l'appelant est membre actif du dossier ou son avocat responsable. */
export async function isDossierMemberOrResponsible(
  dataSource: DataSource | EntityManager,
  dossier: Pick<Dossier, 'id' | 'lawyer_id'> & { lawyer?: { id?: number } | null },
  userId: number,
): Promise<boolean> {
  if (Number(dossier.lawyer_id ?? dossier.lawyer?.id) === Number(userId)) return true;
  const count = await dataSource
    .getRepository(DossierMember)
    .createQueryBuilder('member')
    .where('member.dossier_id = :dossierId', { dossierId: dossier.id })
    .andWhere('member.user_id = :userId', { userId })
    .andWhere('member.revoked_at IS NULL')
    .andWhere('member.valid_from <= UTC_TIMESTAMP()')
    .andWhere('(member.valid_until IS NULL OR member.valid_until > UTC_TIMESTAMP())')
    .getCount();
  return count > 0;
}

/**
 * Garde d'appartenance pour les écrans d'un dossier (espace de travail,
 * actions) : l'appelant de la requête HTTP doit être membre, responsable,
 * collaborateur affecté, client du dossier, admin ou titulaire de « Voir tous
 * les dossiers ». Hors requête HTTP (cron, script), aucun appelant à borner.
 */
export async function assertDossierMembership(
  db: DataSource | EntityManager,
  dossier: Pick<Dossier, 'id' | 'lawyer_id' | 'client_id'> & {
    lawyer?: { id?: number } | null;
    collaborators?: Array<{ id?: number }> | null;
  },
  user: DossierAccessUser | null | undefined = null,
): Promise<void> {
  const request = getCurrentRequestUser();
  const caller: DossierAccessUser | undefined =
    user ?? (request ? { id: request.userId, role: request.role, permissions: request.permissions } : undefined);
  if (!caller?.id) return;
  if (canSeeAllDossiers(caller)) return;
  if (caller.role === UserRole.CLIENT) {
    if (caller.customerId && Number(dossier.client_id) === Number(caller.customerId)) return;
    throw new ForbiddenException('Accès non autorisé à ce dossier');
  }
  const userId = Number(caller.id);
  if (dossier.collaborators?.some((collaborator) => Number(collaborator.id) === userId)) return;
  if (await isDossierMemberOrResponsible(db, dossier, userId)) return;
  throw new ForbiddenException("Vous n'êtes pas membre de ce dossier");
}
