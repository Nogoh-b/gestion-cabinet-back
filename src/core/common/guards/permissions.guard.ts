import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PERMISSIONS_KEY } from "src/core/decorators/permissions.decorator";
import { UsersService } from "src/modules/iam/user/user.service";

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private userService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!user) return false;

    // Bypass admin : le rôle admin a accès à toutes les routes sans vérification
    if (user.role === 'admin') return true;

    // Priorité 1 : permissions embarquées dans le JWT (0 appel DB)
    // Priorité 2 : fallback DB pour les tokens émis avant la migration
    const userPermissionCodes: string[] = Array.isArray(user.permissions)
      ? user.permissions
      : (await this.userService.getUserPermissions(user.userId ?? user.id)).map((p: any) => p.code);

    return (
      userPermissionCodes.includes('SUPER_ADMIN') ||
      requiredPermissions.every((perm) => userPermissionCodes.includes(perm))
    );
  }
}
