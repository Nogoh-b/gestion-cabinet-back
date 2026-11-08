import { ForbiddenException } from '@nestjs/common';
import { UserRole } from 'src/core/enums/user-role.enum';
import {
  getCurrentRequestUser,
  RequestUserStore,
} from 'src/core/security/request-user.context';

/**
 * Mettre fin à une action (terminer ou annuler) est réservé à son responsable,
 * à l'avocat responsable du dossier et aux administrateurs. `Employee.id` et
 * `User.id` sont identiques : `dossier.lawyer_id` se compare à l'id utilisateur.
 *
 * Sans utilisateur de requête (tâche planifiée, traitement interne), la règle
 * ne s'applique pas : elle encadre les personnes, pas le système.
 */
export function canEndDossierAction(
  action: { responsible_user_id?: number | null },
  dossier: { lawyer_id?: number | null },
  actorUserId: number,
  user: RequestUserStore | undefined = getCurrentRequestUser(),
): boolean {
  if (!user) return true;
  if (user.role === UserRole.ADMIN || user.role === 'super_admin') return true;
  const actor = Number(actorUserId);
  return (
    Number(action.responsible_user_id) === actor ||
    Number(dossier.lawyer_id) === actor
  );
}

export function assertCanEndDossierAction(
  action: { responsible_user_id?: number | null },
  dossier: { lawyer_id?: number | null },
  actorUserId: number,
): void {
  if (!canEndDossierAction(action, dossier, actorUserId)) {
    throw new ForbiddenException(
      "Seuls le responsable de l'action, l'avocat responsable du dossier et un administrateur peuvent y mettre fin.",
    );
  }
}
