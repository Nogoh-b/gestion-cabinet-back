import { ForbiddenException } from '@nestjs/common';

import { UserRole } from 'src/core/enums/user-role.enum';
import { getCurrentRequestUser } from './request-user.context';

/**
 * SÉPARATION DES TÂCHES (« quatre yeux ») — préparer et valider une paie,
 * approuver et payer, saisir et approuver une facture fournisseur… sont faits
 * par deux personnes distinctes. L'admin du cabinet peut passer outre : dans un
 * petit cabinet il est souvent seul à gérer ces étapes, et chaque étape reste
 * tracée à son nom (validated_by, paid_by, approved_by…).
 */
export function assertDistinctActor(
  previousActorId: number | null | undefined,
  actorId: number,
  message: string,
): void {
  if (previousActorId == null || Number(previousActorId) !== Number(actorId)) {
    return;
  }
  const requestUser = getCurrentRequestUser();
  if (
    requestUser?.role === UserRole.ADMIN ||
    requestUser?.permissions?.includes('SUPER_ADMIN')
  ) {
    return;
  }
  throw new ForbiddenException(
    `${message}. Un administrateur du cabinet peut le faire.`,
  );
}
