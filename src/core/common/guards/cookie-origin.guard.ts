import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import {
  ACCESS_COOKIE,
  readCookie,
  REFRESH_COOKIE,
} from '../../auth/session-cookie.util';
import { isCorsOriginAllowed } from '../../config/cors-origin';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function configuredOrigins(): string[] {
  return (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean);
}

/**
 * Les cookies HttpOnly empêchent le vol du JWT, mais rendent nécessaire une
 * défense CSRF. Toute mutation authentifiée par cookie doit provenir d'une
 * origine frontend explicitement autorisée.
 */
@Injectable()
export class CookieOriginGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;
    const request = context.switchToHttp().getRequest();
    if (SAFE_METHODS.has(String(request.method).toUpperCase())) return true;
    const hasSessionCookie =
      readCookie(request, ACCESS_COOKIE) != null ||
      readCookie(request, REFRESH_COOKIE) != null;
    if (!hasSessionCookie) return true;

    const origin = String(request.headers.origin ?? '').replace(/\/$/, '');
    if (
      !origin ||
      !isCorsOriginAllowed(
        origin,
        configuredOrigins(),
        process.env.NODE_ENV === 'production',
      )
    ) {
      throw new ForbiddenException(
        'Origine refusée pour une mutation authentifiée',
      );
    }
    return true;
  }
}
