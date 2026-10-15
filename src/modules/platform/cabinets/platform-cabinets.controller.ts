import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PlatformRoute, PlatformRoles } from '../auth/platform-route.decorator';
import { PlatformAudit } from '../audit/platform-audit.decorator';
import {
  CurrentPlatformAdmin,
  PlatformPrincipal,
} from '../common/platform-principal';
import { PlatformCabinetsService } from './platform-cabinets.service';
import { PlatformPaymentsService } from '../payments/platform-payments.service';
import { RecordPaymentDto } from '../payments/dto/platform-payment.dto';
import {
  ApplyCouponDto,
  CancelSubscriptionDto,
  ChangeCabinetPlanDto,
  EmailCabinetDto,
  ExtendSubscriptionDto,
  GrantFreePeriodDto,
  PlatformCabinetQueryDto,
  SuspendCabinetDto,
} from './dto/platform-cabinet.dto';

const CABINET = { targetType: 'cabinet', cabinetParam: 'id' };

@ApiTags('Plateforme — Cabinets')
@Controller('platform/cabinets')
@PlatformRoute()
export class PlatformCabinetsController {
  constructor(
    private readonly service: PlatformCabinetsService,
    private readonly paymentsService: PlatformPaymentsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Lister les cabinets (abonnement courant, CA, utilisateurs)' })
  list(@Query() query: PlatformCabinetQueryDto) {
    return this.service.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Fiche cabinet (abonnement, quotas, revenus, admins)' })
  detail(@Param('id', ParseIntPipe) id: number) {
    return this.service.detail(id);
  }

  @Get(':id/events')
  @ApiOperation({ summary: "Historique de l'abonnement" })
  events(@Param('id', ParseIntPipe) id: number) {
    return this.service.events(id);
  }

  @Get(':id/payments')
  @ApiOperation({ summary: 'Échéances et paiements du cabinet' })
  payments(@Param('id', ParseIntPipe) id: number) {
    return this.service.payments(id);
  }

  @Get(':id/users')
  @ApiOperation({ summary: 'Utilisateurs du cabinet' })
  users(@Param('id', ParseIntPipe) id: number) {
    return this.service.users(id);
  }

  // ── Actions abonnement ────────────────────────────────────────────────────

  @Post(':id/suspend')
  @HttpCode(HttpStatus.OK)
  @PlatformRoles('finance', 'support')
  @PlatformAudit({ action: 'cabinet.suspend', ...CABINET })
  @ApiOperation({ summary: 'Suspendre le cabinet (manuel, jamais levé automatiquement)' })
  suspend(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SuspendCabinetDto,
    @CurrentPlatformAdmin() admin: PlatformPrincipal,
  ) {
    return this.service.suspend(id, dto.note, admin);
  }

  @Post(':id/reactivate')
  @HttpCode(HttpStatus.OK)
  @PlatformRoles('finance', 'support')
  @PlatformAudit({ action: 'cabinet.reactivate', ...CABINET })
  @ApiOperation({ summary: 'Lever la suspension manuelle' })
  reactivate(
    @Param('id', ParseIntPipe) id: number,
    @CurrentPlatformAdmin() admin: PlatformPrincipal,
  ) {
    return this.service.reactivate(id, admin);
  }

  @Post(':id/extend')
  @HttpCode(HttpStatus.OK)
  @PlatformRoles('finance', 'support')
  @PlatformAudit({ action: 'subscription.extend', ...CABINET })
  @ApiOperation({ summary: "Prolonger l'abonnement (jours ou date)" })
  extend(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ExtendSubscriptionDto,
    @CurrentPlatformAdmin() admin: PlatformPrincipal,
  ) {
    return this.service.extend(id, dto, admin);
  }

  @Post(':id/grant-free-period')
  @HttpCode(HttpStatus.OK)
  @PlatformRoles('finance', 'support')
  @PlatformAudit({ action: 'subscription.free_period', ...CABINET })
  @ApiOperation({ summary: 'Offrir des mois gratuits' })
  grantFreePeriod(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: GrantFreePeriodDto,
    @CurrentPlatformAdmin() admin: PlatformPrincipal,
  ) {
    return this.service.grantFreePeriod(id, dto, admin);
  }

  @Post(':id/change-plan')
  @HttpCode(HttpStatus.OK)
  @PlatformRoles('finance', 'support')
  @PlatformAudit({ action: 'subscription.change_plan', ...CABINET })
  @ApiOperation({ summary: 'Changer le plan / cycle' })
  changePlan(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ChangeCabinetPlanDto,
    @CurrentPlatformAdmin() admin: PlatformPrincipal,
  ) {
    return this.service.changePlan(id, dto, admin);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @PlatformRoles('finance')
  @PlatformAudit({ action: 'subscription.cancel', ...CABINET })
  @ApiOperation({ summary: "Résilier l'abonnement (immédiat ou fin de période)" })
  cancel(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CancelSubscriptionDto,
    @CurrentPlatformAdmin() admin: PlatformPrincipal,
  ) {
    return this.service.cancel(id, dto, admin);
  }

  @Post(':id/apply-coupon')
  @HttpCode(HttpStatus.OK)
  @PlatformRoles('finance', 'support')
  @PlatformAudit({ action: 'coupon.apply', ...CABINET })
  @ApiOperation({ summary: "Appliquer un code promo à l'échéance due du cabinet" })
  applyCoupon(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ApplyCouponDto,
    @CurrentPlatformAdmin() admin: PlatformPrincipal,
  ) {
    return this.service.applyCoupon(id, dto.code, admin);
  }

  @Post(':id/email')
  @HttpCode(HttpStatus.OK)
  @PlatformAudit({ action: 'cabinet.email', ...CABINET })
  @ApiOperation({ summary: 'Envoyer un email aux administrateurs du cabinet' })
  email(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EmailCabinetDto,
    @CurrentPlatformAdmin() admin: PlatformPrincipal,
  ) {
    return this.service.email(id, dto, admin);
  }

  @Post(':id/payments')
  @HttpCode(HttpStatus.OK)
  @PlatformRoles('finance')
  @PlatformAudit({ action: 'payment.record', targetType: 'payment', cabinetParam: 'id' })
  @ApiOperation({ summary: 'Enregistrer un encaissement reçu hors ligne' })
  recordPayment(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RecordPaymentDto,
    @CurrentPlatformAdmin() admin: PlatformPrincipal,
  ) {
    return this.paymentsService.record(id, dto, admin);
  }

  // ── Utilisateurs ──────────────────────────────────────────────────────────

  @Post(':id/users/:userId/block')
  @HttpCode(HttpStatus.OK)
  @PlatformRoles('support')
  @PlatformAudit({ action: 'cabinet_user.block', targetType: 'cabinet_user', targetParam: 'userId', cabinetParam: 'id' })
  @ApiOperation({ summary: 'Bloquer un utilisateur du cabinet' })
  block(
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseIntPipe) userId: number,
  ) {
    return this.service.setUserBlocked(id, userId, true);
  }

  @Post(':id/users/:userId/unblock')
  @HttpCode(HttpStatus.OK)
  @PlatformRoles('support')
  @PlatformAudit({ action: 'cabinet_user.unblock', targetType: 'cabinet_user', targetParam: 'userId', cabinetParam: 'id' })
  @ApiOperation({ summary: 'Débloquer un utilisateur du cabinet' })
  unblock(
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseIntPipe) userId: number,
  ) {
    return this.service.setUserBlocked(id, userId, false);
  }

  @Post(':id/users/:userId/reset-password')
  @HttpCode(HttpStatus.OK)
  @PlatformRoles('support')
  @PlatformAudit({ action: 'cabinet_user.password_reset', targetType: 'cabinet_user', targetParam: 'userId', cabinetParam: 'id' })
  @ApiOperation({ summary: 'Envoyer un code de réinitialisation du mot de passe' })
  resetPassword(
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseIntPipe) userId: number,
  ) {
    return this.service.sendPasswordReset(id, userId);
  }

  @Post(':id/users/:userId/disable-mfa')
  @HttpCode(HttpStatus.OK)
  @PlatformRoles('support')
  @PlatformAudit({ action: 'cabinet_user.disable_mfa', targetType: 'cabinet_user', targetParam: 'userId', cabinetParam: 'id' })
  @ApiOperation({ summary: 'Désactiver la double authentification (perte d’accès email)' })
  disableMfa(
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseIntPipe) userId: number,
  ) {
    return this.service.disableMfa(id, userId);
  }
}
