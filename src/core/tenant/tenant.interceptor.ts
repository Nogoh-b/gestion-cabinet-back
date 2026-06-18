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
    // Priorité : JWT (utilisateur connecté) → middleware (header/subdomain/path) → défaut 1
    const tenantId: number =
      request.user?.tenantId ??
      (request as any)['resolvedTenantId'] ??
      1;

    // Tout le traitement de la requête (guards, pipes, service, réponse)
    // s'exécute dans ce contexte → TenantContext.getTenantId() retourne
    // le bon tenantId partout, pour toute la durée de la requête.
    return new Observable((observer) => {
      this.tenantContext.run(tenantId, () => {
        next.handle().subscribe({
          next:     (value) => observer.next(value),
          error:    (err)   => observer.error(err),
          complete: ()      => observer.complete(),
        });
      });
    });
  }
}
