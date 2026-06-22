import {
  Controller,
  Get,
  Patch,
  Body,
  Request,
  UseGuards,
} from '@nestjs/common';
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

  /** Abonnement courant du cabinet + décompte (jours restants). */
  @Get('/current')
  @ApiOperation({ summary: 'Abonnement courant du cabinet (avec décompte)' })
  getCurrent(@Request() req: any) {
    return this.service.getCurrent(req.user?.tenantId);
  }

  /** Historique de facturation (échéances + paiements). */
  @Get('/payments')
  @ApiOperation({ summary: 'Historique de facturation du cabinet' })
  listPayments(@Request() req: any) {
    return this.service.listPayments(req.user?.tenantId);
  }

  /** Change le plan et/ou le cycle (mensuel ↔ annuel). */
  @Patch('/change')
  @ApiOperation({ summary: 'Changer de plan et/ou de cycle de facturation' })
  change(@Request() req: any, @Body() dto: ChangeSubscriptionDto) {
    return this.service.changePlanOrCycle(req.user?.tenantId, {
      planId: dto.plan_id,
      cycle: dto.cycle,
    });
  }

  /** Renouvelle l'abonnement échu et réactive le cabinet. */
  @Patch('/renew')
  @ApiOperation({ summary: "Renouveler l'abonnement (réactive le cabinet)" })
  renew(@Request() req: any, @Body() dto: ChangeSubscriptionDto) {
    return this.service.renewForCabinet(req.user?.tenantId, dto?.cycle);
  }

  // ── Outils DEV (403 en production) ─────────────────────────────────────────

  /** [DEV] Force la date de fin à now + days (négatif = passé). */
  @Patch('/dev/set-ends-in')
  @ApiOperation({ summary: '[DEV] Définir la date de fin à N jours' })
  devSetEndsIn(@Request() req: any, @Body() dto: { days?: number }) {
    return this.service.devSetEndsIn(req.user?.tenantId, Number(dto?.days ?? 0));
  }

  /** [DEV] Expire immédiatement l'abonnement (suspend le cabinet). */
  @Patch('/dev/expire-now')
  @ApiOperation({ summary: '[DEV] Expirer immédiatement' })
  devExpireNow(@Request() req: any) {
    return this.service.devExpireNow(req.user?.tenantId);
  }

  /** [DEV] Recrée un essai neuf pour le plan courant. */
  @Patch('/dev/reset-trial')
  @ApiOperation({ summary: '[DEV] Réinitialiser un essai' })
  devResetTrial(@Request() req: any) {
    return this.service.devResetTrial(req.user?.tenantId);
  }
}
