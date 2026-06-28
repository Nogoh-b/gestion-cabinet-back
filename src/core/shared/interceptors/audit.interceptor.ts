import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { ActivitiesUserService } from 'src/modules/iam/activities-user/activities-user.service';

/** Méthodes considérées comme des mutations à auditer. */
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Chemins ignorés (bruit / non significatifs). */
const SKIP = [/\/auth\/refresh/i, /\/activities-user/i];

/**
 * AuditInterceptor — journalise chaque mutation authentifiée dans
 * `activities_user`. Best-effort et non bloquant : l'enregistrement est lancé
 * après l'émission de la réponse et n'impacte ni la latence ni le résultat.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: ActivitiesUserService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<any> {
    if (ctx.getType() !== 'http') return next.handle();

    const req = ctx.switchToHttp().getRequest();
    const method = String(req?.method ?? '').toUpperCase();
    const userId: number | undefined = req?.user?.userId ?? req?.user?.id;
    const path: string = req?.originalUrl ?? req?.url ?? req?.path ?? '';

    if (!MUTATING.has(method) || !userId || SKIP.some((re) => re.test(path))) {
      return next.handle();
    }

    return next.handle().pipe(
      tap((body) => {
        const res = ctx.switchToHttp().getResponse();
        const resource = this.resourceOf(path);
        const resourceId =
          req?.params?.id ?? body?.id ?? body?.data?.id ?? null;
        // Fire-and-forget — record() avale ses propres erreurs.
        void this.audit.record({
          userId,
          action: this.actionFor(method),
          resource,
          resourceId: resourceId != null ? String(resourceId) : null,
          method,
          path: path.slice(0, 255),
          statusCode: res?.statusCode ?? null,
          ip: this.ipOf(req),
          summary: `${method} ${path}`.slice(0, 255),
        });
      }),
    );
  }

  private actionFor(method: string): string {
    if (method === 'POST') return 'create';
    if (method === 'DELETE') return 'delete';
    return 'update'; // PUT / PATCH
  }

  /** 1er segment métier de la route (gère les préfixes /api et /t/<code>). */
  private resourceOf(path: string): string | null {
    const seg = path.split('?')[0].split('/').filter(Boolean);
    if (!seg.length) return null;
    if (seg[0] === 'api' && seg[1]) return seg[1];
    if (seg[0] === 't' && seg.length > 2) return seg[2];
    return seg[0];
  }

  private ipOf(req: any): string | null {
    const fwd = req?.headers?.['x-forwarded-for'];
    if (typeof fwd === 'string' && fwd) return fwd.split(',')[0].trim().slice(0, 64);
    return (req?.ip ?? req?.socket?.remoteAddress ?? null)?.toString().slice(0, 64) ?? null;
  }
}
