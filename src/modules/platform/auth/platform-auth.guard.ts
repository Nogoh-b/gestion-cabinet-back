import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { PLATFORM_JWT_STRATEGY } from './platform-jwt.strategy';
import type { PlatformRole } from '../entities/platform-admin.entity';

export const PLATFORM_ROLES_KEY = 'platformRoles';

/** Authentifie via le jeton plateforme (Bearer). */
@Injectable()
export class PlatformAuthGuard extends AuthGuard(PLATFORM_JWT_STRATEGY) {}

/**
 * Vérifie le rôle plateforme exigé par `@PlatformRoute(...roles)`.
 * Le Propriétaire (`owner`) a tous les droits. Liste vide = tout admin.
 */
@Injectable()
export class PlatformRolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles =
      this.reflector.getAllAndOverride<PlatformRole[]>(PLATFORM_ROLES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    const user = context.switchToHttp().getRequest().user;
    if (!user?.isPlatform) {
      throw new ForbiddenException('Accès réservé à la plateforme.');
    }
    if (!roles.length || user.role === 'owner' || roles.includes(user.role)) {
      return true;
    }
    throw new ForbiddenException(
      "Votre rôle plateforme ne permet pas cette action.",
    );
  }
}
