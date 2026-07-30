import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { UsersService } from '../../../modules/iam/user/user.service';

/**
 * L'IA est opt-in. L'absence de configuration ferme l'accès, y compris aux
 * endpoints de schéma et de métriques qui exposent la structure de la base.
 */
@Injectable()
export class AiFeatureGuard implements CanActivate {
  constructor(private readonly usersService: UsersService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (process.env.AI_ENABLED !== 'true') {
      throw new ServiceUnavailableException('Fonctionnalités IA désactivées');
    }
    const user = context.switchToHttp().getRequest()?.user;
    let permissions: string[] = Array.isArray(user?.permissions) ? user.permissions : [];
    const isSuperAdmin = permissions.includes('SUPER_ADMIN');
    if (user?.role !== 'admin' && !isSuperAdmin) {
      // Tant que les requetes SQL IA ne sont pas filtrees dossier par dossier,
      // l'acces reste volontairement limite aux administrateurs du cabinet.
      throw new ForbiddenException(
        'Assistant IA reserve a administration du cabinet.',
      );
    }

    if (!isSuperAdmin && !permissions.includes('use_ai_assistant')) {
      const userId = Number(user?.userId ?? user?.id);
      if (Number.isFinite(userId)) {
        permissions = (await this.usersService.getUserPermissions(userId))
          .map((permission: { code: string }) => permission.code);
      }
      if (!permissions.includes('use_ai_assistant')) {
        throw new ForbiddenException(
          'Permission use_ai_assistant requise.',
        );
      }
    }

    return true;
  }
}
