// src/core/common/guards/suspended-cabinet.guard.ts
//
// Guard qui bloque l'accès si le cabinet est en statut 'suspended'.
// Retourne 403 Forbidden sur toutes les API sauf les routes marquées @Public().
//
// Ce guard doit être appliqué APRÈS JwtAuthGuard (qui vérifie l'auth) et
// APRES le TenantResolverMiddleware (qui résout resolvedTenantId).
import { IS_PUBLIC_KEY } from 'src/core/decorators/public.decorator';
import { Cabinet } from 'src/modules/cabinet/entities/cabinet.entity';
import { SubscriptionsService } from 'src/modules/subscriptions/subscriptions.service';
import { Repository } from 'typeorm';
import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';

/** Fenêtre (ms) pendant laquelle on évite de re-vérifier l'échéance d'un même cabinet. */
const REFRESH_TTL_MS = 60_000;

@Injectable()
export class SuspendedCabinetGuard implements CanActivate {
  /** Cache mémoire : cabinetId → timestamp du dernier rafraîchissement d'abonnement. */
  private readonly lastRefresh = new Map<number, number>();

  constructor(
    private reflector: Reflector,
    @InjectRepository(Cabinet)
    private cabinetRepo: Repository<Cabinet>,
    private subscriptionsService: SubscriptionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 1. Routes publiques → laisser passer (login, onboarding, resolve...)
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    // 2. Récupérer l'ID du tenant (cabinet)
    const req = context.switchToHttp().getRequest();
    const tenantId = req.resolvedTenantId ?? req.user?.tenantId;

    if (!tenantId) return true; // pas de tenant → laisser passer

    // 3. Mettre l'abonnement à jour AVANT de décider (transition essai→payant /
    //    suspension à l'échéance), au plus une fois par fenêtre TTL et par
    //    cabinet pour ne pas requêter l'abonnement à chaque appel.
    const now = Date.now();
    const last = this.lastRefresh.get(tenantId) ?? 0;
    if (now - last > REFRESH_TTL_MS) {
      this.lastRefresh.set(tenantId, now);
      // Non bloquant : une erreur de rafraîchissement ne doit pas refuser la
      // requête. Le contrôle de statut ci-dessous reste la garde effective.
      try {
        await this.subscriptionsService.refreshCabinetSubscription(tenantId);
      } catch {
        /* ignore — best effort */
      }
    }

    // 4. Vérifier le statut (potentiellement mis à jour) du cabinet
    const cabinet = await this.cabinetRepo.findOne({
      where: { id: tenantId },
      select: ['id', 'status'],
    });

    if (cabinet?.status === 'suspended') {
      throw new ForbiddenException('Cabinet suspendu — abonnement expiré');
    }

    return true;
  }
}
