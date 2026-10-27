import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import type { Socket } from 'socket.io';
import { TenantContext } from './tenant.context';

/**
 * Équivalent WebSocket de `TenantInterceptor` : les intercepteurs globaux ne
 * s'appliquent pas aux gateways, et une socket n'a pas de `request.user`.
 * Le cabinet résolu à la connexion (`client.data.tenantId`, issu du JWT)
 * encadre donc chaque handler : écritures (`tenant_id`) et lectures filtrées
 * comme pour une requête HTTP.
 */
@Injectable()
export class WsTenantInterceptor implements NestInterceptor {
  constructor(private readonly tenantContext: TenantContext) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'ws') return next.handle();
    const client = context.switchToWs().getClient<Socket>();
    const tenantId = Number(client?.data?.tenantId);
    if (!Number.isInteger(tenantId) || tenantId <= 0) return next.handle();

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
