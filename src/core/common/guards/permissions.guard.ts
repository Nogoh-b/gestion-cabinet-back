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
    const requiredPermissions = this.reflector.get<string[]>(
      PERMISSIONS_KEY,
      context.getHandler(),
    );

    if (!requiredPermissions) return true;

    const { user } = context.switchToHttp().getRequest();
    const userPermissions = await this.userService.getUserPermissions(user.userId);
    
    // Extraire les codes de permission de chaque objet Permission
    const userPermissionCodes = userPermissions.map(perm => perm.code);
      console.log(user);
    // Vérifier que toutes les permissions requises sont présentes
    return requiredPermissions.every((perm) => userPermissionCodes.includes(perm)) || userPermissionCodes.includes('SUPER_ADMIN');
}
}