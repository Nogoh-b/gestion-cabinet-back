import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { UsersService } from '../../../modules/iam/user/user.service';

export const AI_ASSISTANT_PERMISSION = 'use_ai_assistant';
const SUPER_ADMIN = 'SUPER_ADMIN';

/** Liste des permissions du jeton (relues en base par JwtStrategy). */
function requestPermissions(user: any): string[] {
  return Array.isArray(user?.permissions) ? user.permissions : [];
}

/**
 * Accès à l'assistant IA du cabinet.
 *
 * - `AI_ENABLED=false` coupe l'IA sur ce serveur. Sans la variable, l'IA reste
 *   gouvernée par le module « ai » du forfait (AiQuotaGuard) : la poser n'est
 *   pas nécessaire pour que les cabinets abonnés gardent leur assistant.
 * - L'administrateur du cabinet a accès (comme partout ailleurs dans
 *   l'application) ; les autres rôles doivent avoir `use_ai_assistant`.
 *
 * Les droits table par table restent contrôlés à chaque requête par
 * AiDatabasePermissionService.
 */
@Injectable()
export class AiFeatureGuard implements CanActivate {
  constructor(private readonly usersService: UsersService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (process.env.AI_ENABLED === 'false') {
      throw new ServiceUnavailableException('Fonctionnalités IA désactivées');
    }
    const user = context.switchToHttp().getRequest()?.user;
    let permissions = requestPermissions(user);
    if (permissions.includes(SUPER_ADMIN) || user?.role === 'admin') {
      return true;
    }
    if (permissions.includes(AI_ASSISTANT_PERMISSION)) return true;

    // Jeton sans permissions (ancien format) : relecture en base.
    if (!permissions.length) {
      const userId = Number(user?.userId ?? user?.id);
      if (Number.isFinite(userId)) {
        permissions = (await this.usersService.getUserPermissions(userId))
          .map((permission: { code: string }) => permission.code);
      }
      if (permissions.includes(AI_ASSISTANT_PERMISSION)) return true;
    }

    throw new ForbiddenException(
      "Vous n'avez pas accès à l'assistant IA (permission use_ai_assistant requise).",
    );
  }
}

/**
 * Endpoints techniques de l'IA (SQL brut, schéma de la base, métriques) :
 * réservés au super administrateur. Le front du cabinet ne les appelle pas.
 */
@Injectable()
export class AiTechnicalGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest()?.user;
    if (requestPermissions(user).includes(SUPER_ADMIN)) return true;
    throw new ForbiddenException(
      'Endpoint technique de l’assistant IA réservé au super administrateur.',
    );
  }
}
