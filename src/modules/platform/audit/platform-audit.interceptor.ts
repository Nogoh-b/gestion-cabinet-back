import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { PlatformAuditContext } from './platform-audit.context';
import {
  PLATFORM_AUDIT_KEY,
  PlatformAuditMeta,
} from './platform-audit.decorator';
import { PlatformAuditService } from './platform-audit.service';
import {
  PlatformPrincipal,
  requestIp,
} from '../common/platform-principal';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const AUDITABLE_READ = /\/(?:download|export|receipt)(?:\/|\?|$)/i;

/**
 * Journalise chaque requête mutante (et chaque export/téléchargement) de
 * l'espace plateforme : une ligne par requête, succès comme échec.
 */
@Injectable()
export class PlatformAuditInterceptor implements NestInterceptor {
  constructor(
    private readonly audit: PlatformAuditService,
    private readonly reflector: Reflector,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<any> {
    if (ctx.getType() !== 'http') return next.handle();
    const req = ctx.switchToHttp().getRequest();
    const method = String(req?.method ?? '').toUpperCase();
    const path = String(req?.originalUrl ?? req?.url ?? '').split('?')[0];
    const auditable =
      MUTATING.has(method) || (method === 'GET' && AUDITABLE_READ.test(path));
    if (!auditable) return next.handle();

    const meta = this.reflector.getAllAndOverride<PlatformAuditMeta>(
      PLATFORM_AUDIT_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );

    return new Observable((observer) => {
      PlatformAuditContext.run(() => {
        const write = (statusCode: number, error?: any) => {
          const details = PlatformAuditContext.get() ?? {};
          const admin: PlatformPrincipal | undefined = req?.user?.isPlatform
            ? req.user
            : undefined;
          const params = req?.params ?? {};
          const targetId =
            details.targetId ?? params[meta?.targetParam ?? 'id'] ?? null;
          const cabinetParam = meta?.cabinetParam
            ? params[meta.cabinetParam]
            : undefined;
          const outcome =
            statusCode === 403
              ? 'denied'
              : statusCode >= 400
                ? 'failure'
                : 'success';
          void this.audit.record({
            adminId: admin?.id ?? null,
            adminEmail: admin?.email ?? null,
            action:
              details.action ??
              meta?.action ??
              `${method.toLowerCase()} ${path}`,
            targetType: details.targetType ?? meta?.targetType ?? null,
            targetId,
            cabinetId:
              details.cabinetId ??
              (cabinetParam !== undefined ? Number(cabinetParam) : null),
            summary:
              details.summary ??
              (error ? String(error?.message ?? error).slice(0, 500) : null),
            before: details.before ?? null,
            after: details.after ?? null,
            method,
            path,
            statusCode,
            outcome,
            ip: requestIp(req),
            userAgent: String(req?.headers?.['user-agent'] ?? '') || null,
          });
        };

        next.handle().subscribe({
          next: (value) => observer.next(value),
          error: (err) => {
            const status = err instanceof HttpException ? err.getStatus() : 500;
            write(status, err);
            observer.error(err);
          },
          complete: () => {
            const res = ctx.switchToHttp().getResponse();
            write(Number(res?.statusCode ?? 200));
            observer.complete();
          },
        });
      });
    });
  }
}
