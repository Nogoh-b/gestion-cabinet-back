import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Request,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { Public } from 'src/core/decorators/public.decorator';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { SubscriptionsService } from './subscriptions.service';
import { ChangeSubscriptionDto } from './dto/change-subscription.dto';

@ApiTags('Subscriptions')
@Controller('subscriptions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class SubscriptionsController {
  constructor(private readonly service: SubscriptionsService) {}

  /**
   * Résout le cabinet courant.
   *
   * ⚠️ Ces routes sont `@Public()` (pour rester accessibles à un cabinet
   * suspendu), donc `JwtAuthGuard` ne peuple PAS `req.user`. On retombe alors
   * sur `req.resolvedTenantId` posé par le TenantResolverMiddleware à partir du
   * header `x-tenant-code`. Sans ce fallback, `req.user?.tenantId` est
   * `undefined` et le service opère sur le mauvais cabinet (ex. renew qui ne
   * réactive jamais le cabinet).
   */
  private tenantOf(req: any): number {
    const tenantId = req.user?.tenantId ?? req.resolvedTenantId;
    if (!tenantId) {
      // Évite que le service opère sur un cabinet arbitraire (where cabinet_id
      // = undefined => pas de filtre côté TypeORM).
      throw new BadRequestException(
        "Cabinet non résolu : header 'x-tenant-code' manquant ou invalide.",
      );
    }
    return tenantId;
  }

  /** Abonnement courant du cabinet + décompte (jours restants). */
  @Public()
  @Get('/current')
  @ApiOperation({ summary: 'Abonnement courant du cabinet (avec décompte)' })
  getCurrent(@Request() req: any) {
    return this.service.getCurrent(this.tenantOf(req));
  }

  /** Historique de facturation (échéances + paiements). */
  @Public()
  @Get('/payments')
  @ApiOperation({ summary: 'Historique de facturation du cabinet' })
  listPayments(@Request() req: any) {
    return this.service.listPayments(this.tenantOf(req));
  }

  /** Change le plan et/ou le cycle (mensuel ↔ annuel). */
  @Public()
  @Patch('/change')
  @ApiOperation({ summary: 'Changer de plan et/ou de cycle de facturation' })
  change(@Request() req: any, @Body() dto: ChangeSubscriptionDto) {
    return this.service.changePlanOrCycle(this.tenantOf(req), {
      planId: dto.plan_id,
      cycle: dto.cycle,
    });
  }

  /** Renouvelle l'abonnement échu et réactive le cabinet. */
  @Public()
  @Patch('/renew')
  @ApiOperation({ summary: "Renouveler l'abonnement (réactive le cabinet)" })
  renew(@Request() req: any, @Body() dto: ChangeSubscriptionDto) {
    return this.service.renewForCabinet(this.tenantOf(req), dto?.cycle);
  }

  // ── Paiement (passerelle) ───────────────────────────────────────────────────

  /** Initie une session de paiement pour l'échéance en attente (retourne l'URL). */
  @Public()
  @Post('/pay')
  @ApiOperation({ summary: "Initier le paiement de l'échéance en attente" })
  pay(@Request() req: any) {
    return this.service.initiatePaymentForCurrent(this.tenantOf(req));
  }

  /**
   * Webhook de la passerelle : confirme/échoue un paiement via sa référence.
   * Public et SANS tenant (la passerelle rappelle ce endpoint, identifie par
   * référence). À sécuriser par signature quand une vraie passerelle est branchée.
   */
  @Public()
  @Post('/payments/webhook')
  @ApiOperation({ summary: 'Webhook passerelle (confirmation de paiement)' })
  webhook(@Body() dto: { reference?: string; status?: 'paid' | 'failed' }) {
    return this.service.handleWebhook(dto?.reference ?? '', dto?.status ?? 'paid');
  }

  /** [TEST] Simule un encaissement réussi (passerelle de test uniquement). */
  @Public()
  @Post('/payments/simulate')
  @ApiOperation({ summary: '[TEST] Simuler un paiement réussi' })
  simulate(@Request() req: any, @Body() dto: { payment_id?: number }) {
    return this.service.simulatePayment(this.tenantOf(req), dto?.payment_id);
  }

  // ── Outils DEV (403 en production) ─────────────────────────────────────────
  // Tous @Public() : un cabinet suspendu doit pouvoir piloter ces outils
  // (sinon le panneau dev se verrouille). La protection prod est faite par
  // assertDev() côté service.

  /** [DEV] Force la date de fin à now + days (négatif = passé). */
  @Public()
  @Patch('/dev/set-ends-in')
  @ApiOperation({ summary: '[DEV] Définir la date de fin à N jours' })
  devSetEndsIn(@Request() req: any, @Body() dto: { days?: number }) {
    return this.service.devSetEndsIn(this.tenantOf(req), Number(dto?.days ?? 0));
  }

  /** [DEV] Termine l'essai en cours → bascule en période payante. */
  @Public()
  @Patch('/dev/end-trial-now')
  @ApiOperation({ summary: "[DEV] Terminer l'essai (passage en payant)" })
  devEndTrialNow(@Request() req: any) {
    return this.service.devEndTrialNow(this.tenantOf(req));
  }

  /** [DEV] Expire immédiatement l'abonnement (suspend le cabinet). */
  @Public()
  @Patch('/dev/expire-now')
  @ApiOperation({ summary: '[DEV] Expirer immédiatement' })
  devExpireNow(@Request() req: any) {
    return this.service.devExpireNow(this.tenantOf(req));
  }

  /** [DEV] Recrée un essai neuf pour le plan courant. */
  @Public()
  @Patch('/dev/reset-trial')
  @ApiOperation({ summary: '[DEV] Réinitialiser un essai' })
  devResetTrial(@Request() req: any) {
    return this.service.devResetTrial(this.tenantOf(req));
  }
}
