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
    // On ne retombe PLUS sur tenant_id=1 par défaut pour les routes publiques :
    // si ni le JWT ni la résolution n'ont donné de tenant, aucun contexte n'est
    // activé (les routes publiques ne doivent pas accéder aux données métier).
    const jwtTenantId = request.user?.tenantId;
    const resolvedTenantId = (request as any)['resolvedTenantId'];
    const tenantId: number | undefined = jwtTenantId ?? resolvedTenantId;

    // Tout le traitement de la requête (pipes, service, réponse) s'exécute dans
    // ce contexte → TenantContext.getTenantId() retourne le bon tenantId partout.
    // explicit=true : ce tenant provient soit du JWT, soit d'une résolution
    // header/subdomain/path — donc fiable pour l'isolation des données.
    if (tenantId === undefined) {
      // Pas de tenant : on n'active aucun contexte. Les repositories ne
      // filtreront pas (hasActiveTenant() = false → comportement inchangé
      // pour les routes réellement publiques / les données globales).
      return next.handle();
    }

    return new Observable((observer) => {
      this.tenantContext.run(tenantId, () => {
        next.handle().subscribe({
          next:     (value) => observer.next(value),
          error:    (err)   => observer.error(err),
          complete: ()      => observer.complete(),
        });
      }, true);
    });
  }
}
