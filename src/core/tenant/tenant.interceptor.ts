import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { TenantContext } from './tenant.context';

/**
 * TenantInterceptor — interceptor global qui :
 *   1. Lit le tenantId depuis req.user (issu du JWT via JwtStrategy)
 *   2. Enveloppe toute la chaîne de traitement dans TenantContext.run()
 *
 * Enregistré globalement dans CoreModule → s'applique à TOUTES les routes
 * sans aucune modification des controllers ou services existants.
 *
 * Pour les routes publiques (pas de JWT), tenantId = 1 par défaut.
 */
@Injectable()
export class TenantInterceptor implements NestInterceptor {
  constructor(private readonly tenantContext: TenantContext) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    // Priorité : JWT (utilisateur connecté) → middleware (header/subdomain/path).
    // Aucun repli sur un cabinet par défaut : si ni le JWT ni la résolution
    // n'ont donné de tenant, aucun contexte n'est activé (les routes publiques
    // n'accèdent pas aux données métier).
    const tenantId: number | undefined =
      request.user?.tenantId ?? (request as any)['resolvedTenantId'];

    if (!tenantId) {
      return next.handle();
    }

    return new Observable((observer) => {
      this.tenantContext.run(
        tenantId,
        () => {
          next.handle().subscribe({
            next: (value) => observer.next(value),
            error: (err) => observer.error(err),
            complete: () => observer.complete(),
          });
        },
        true,
      );
    });
  }
}
