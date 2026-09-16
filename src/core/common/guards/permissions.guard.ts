import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Optional,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from 'src/core/decorators/permissions.decorator';
import { ActivitiesUserService } from 'src/modules/iam/activities-user/activities-user.service';
import { UsersService } from 'src/modules/iam/user/user.service';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly userService: UsersService,
    @Optional()
    private readonly audit?: ActivitiesUserService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredPermissions) return true;

    const request = context.switchToHttp().getRequest();
    const { user } = request;
    if (user.role === 'admin') return true;

    const userPermissionCodes: string[] = Array.isArray(user.permissions)
      ? user.permissions
      : (await this.userService.getUserPermissions(user.userId)).map(
          (permission: any) => permission.code,
        );
    const allowed =
      userPermissionCodes.includes('SUPER_ADMIN') ||
      requiredPermissions.every((permission) =>
        userPermissionCodes.includes(permission),
      );

    if (!allowed && this.audit) {
      const path = String(request?.originalUrl ?? request?.url ?? '');
      await this.audit.record({
        tenantId: user.tenantId,
        userId: user.userId ?? user.id,
        action: 'access_denied',
        resource: path.split('?')[0].split('/').filter(Boolean).pop() ?? null,
        resourceId: request?.params?.id ?? request?.params?.userId ?? null,
        method: request?.method ?? null,
        path: path.slice(0, 255),
        statusCode: 403,
        ip: request?.ip ?? request?.socket?.remoteAddress ?? null,
        summary: 'Tentative d’accès sans droit suffisant',
        authorizationResult: 'denied',
        requiredPermissions,
        grantedPermissions: userPermissionCodes,
        riskLevel: 'high',
        errorMessage: 'Droit requis absent',
      });
    }
    return allowed;
  }
}
