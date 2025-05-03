import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from 'src/core/decorators/permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredPermissions) {
      return true; // aucune permission requise
    }

    const { user } = context.switchToHttp().getRequest();

    // 👇 vérifier si l'utilisateur possède l'une des permissions requises
    const userPermissions = user.permissions || [];
    return requiredPermissions.some(permission => userPermissions.includes(permission));
  }
}
