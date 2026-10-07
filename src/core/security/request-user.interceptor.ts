import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { RequestUserContext } from './request-user.context';

/**
 * RequestUserInterceptor — interceptor global qui enveloppe le traitement de
 * la requête dans le contexte de l'appelant (issu du JWT via JwtStrategy).
 *
 * Pendant de TenantInterceptor, enregistré au même endroit dans CoreModule.
 * Les filtres de visibilité (dossiers confidentiels) lisent ce contexte sans
 * que les controllers ni les services aient à propager l'utilisateur.
 *
 * Routes publiques (pas de JWT) : aucun contexte n'est activé. Les filtres
 * doivent alors se comporter en « fail-closed » — voir dossier-visibility.ts.
 */
@Injectable()
export class RequestUserInterceptor implements NestInterceptor {
  constructor(private readonly requestUserContext: RequestUserContext) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const user = request?.user;

    if (!user?.id) {
      return next.handle();
    }

    return new Observable((observer) => {
      this.requestUserContext.run(
        {
          userId: Number(user.id),
          role: user.role,
          permissions: Array.isArray(user.permissions) ? user.permissions : [],
        },
        () => {
          next.handle().subscribe({
            next: (value) => observer.next(value),
            error: (err) => observer.error(err),
            complete: () => observer.complete(),
          });
        },
      );
    });
  }
}
