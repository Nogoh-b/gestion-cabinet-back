import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ALLOW_CLIENT_KEY } from '../decorators/allow-client.decorator';
import { UserRole } from '../enums/user-role.enum';

/** Compte du portail client (rôle relu en base par JwtStrategy). */
export function isClientUser(user: any): boolean {
  return user?.role === UserRole.CLIENT;
}

/**
 * Liste blanche du portail client : un compte `client` n'atteint que les
 * routes marquées @AllowClient() (méthode ou contrôleur). Tout le reste est
 * refusé, y compris les routes qui ne contrôlent aucune permission. Les rôles
 * du cabinet ne sont pas concernés.
 */
export function assertClientRouteAllowed(
  reflector: Reflector,
  context: ExecutionContext,
): void {
  const user = context.switchToHttp().getRequest()?.user;
  if (!isClientUser(user)) return;

  const allowed = reflector.getAllAndOverride<boolean>(ALLOW_CLIENT_KEY, [
    context.getHandler(),
    context.getClass(),
  ]);
  if (!allowed) {
    throw new ForbiddenException(
      "Cette ressource n'est pas accessible depuis l'espace client.",
    );
  }
}
