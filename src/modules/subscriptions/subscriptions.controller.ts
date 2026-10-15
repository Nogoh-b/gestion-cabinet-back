import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  ParseIntPipe,
  Request,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { AllowSuspended } from 'src/core/decorators/allow-suspended.decorator';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/core/common/guards/permissions.guard';
import { RequirePermissions } from 'src/core/decorators/permissions.decorator';
import { SubscriptionsService } from './subscriptions.service';
import { ChangeSubscriptionDto } from './dto/change-subscription.dto';
import { cabinetUserActor } from './subscription-events.service';
import { PaymentMethodsService } from './payment/payment-methods.service';
import { ReceiptService } from './billing/receipt.service';

@ApiTags('Subscriptions')
@Controller('subscriptions')
@ApiBearerAuth()
@AllowSuspended()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SubscriptionsController {
  constructor(
    private readonly service: SubscriptionsService,
    private readonly methods: PaymentMethodsService,
    private readonly receipts: ReceiptService,
  ) {}

  /**
   * Résout le cabinet courant.
   *
   * Ces routes restent authentifiées afin que `req.user.tenantId` soit
   * disponible même lorsque le header `x-tenant-code` n'est pas encore présent
   * lors de la première connexion. `@AllowSuspended()` permet néanmoins à un
   * cabinet suspendu de consulter et renouveler son abonnement.
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
  @Get('/current')
  @ApiOperation({ summary: 'Abonnement courant du cabinet (avec décompte)' })
  getCurrent(@Request() req: any) {
    return this.service.getCurrent(this.tenantOf(req));
  }

  /** Historique de facturation (échéances + paiements). */
  @Get('/payments')
  @ApiOperation({ summary: 'Historique de facturation du cabinet' })
  listPayments(@Request() req: any) {
    return this.service.listPayments(this.tenantOf(req));
  }

  /** Change le plan et/ou le cycle (mensuel ↔ annuel). */
  @Patch('/change')
  @RequirePermissions('manage_subscription')
  @ApiOperation({ summary: 'Changer de plan et/ou de cycle de facturation' })
  change(@Request() req: any, @Body() dto: ChangeSubscriptionDto) {
    return this.service.changePlanOrCycle(
      this.tenantOf(req),
      { planId: dto.plan_id, cycle: dto.cycle, couponCode: dto.coupon_code },
      cabinetUserActor(req.user),
    );
  }

  /** Renouvelle l'abonnement échu et réactive le cabinet. */
  @Patch('/renew')
  @RequirePermissions('manage_subscription')
  @ApiOperation({ summary: "Renouveler l'abonnement (réactive le cabinet)" })
  renew(@Request() req: any, @Body() dto: ChangeSubscriptionDto) {
    return this.service.renewForCabinet(
      this.tenantOf(req),
      dto?.cycle,
      cabinetUserActor(req.user),
      dto?.coupon_code,
    );
  }

  // ── Paiement ────────────────────────────────────────────────────────────────

  /** Moyens de paiement proposés (aucune donnée secrète). */
  @Get('/payment-methods')
  @ApiOperation({ summary: 'Moyens de paiement disponibles' })
  async paymentMethods(@Request() req: any) {
    const current = await this.service.getCurrent(this.tenantOf(req));
    return this.methods.listActiveForCabinet(
      current.pending_payment?.currency ?? current.subscription?.currency ?? 'XAF',
    );
  }

  /**
   * Démarre le paiement de l'échéance due avec le moyen choisi : URL de la
   * passerelle (en ligne) ou instructions (moyen manuel).
   */
  @Post('/pay')
  @RequirePermissions('manage_subscription')
  @ApiOperation({ summary: "Payer l'échéance due avec un moyen de paiement" })
  pay(@Request() req: any, @Body() dto: { method_code?: string }) {
    return this.service.initiatePaymentForCurrent(this.tenantOf(req), {
      methodCode: dto?.method_code,
      customer: { email: req.user?.email ?? null },
    });
  }

  /** Applique un code promo à l'échéance due (avant paiement). */
  @Post('/coupons/apply')
  @RequirePermissions('manage_subscription')
  @ApiOperation({ summary: "Appliquer un code promo à l'échéance due" })
  applyCoupon(@Request() req: any, @Body() dto: { code?: string }) {
    return this.service.applyCouponToDuePayment(
      this.tenantOf(req),
      String(dto?.code ?? ''),
      cabinetUserActor(req.user),
    );
  }

  /** Statut à jour d'une transaction (retour de la passerelle). */
  @Get('/payments/status/:reference')
  @ApiOperation({ summary: "Statut d'une transaction (vérifié auprès de la passerelle)" })
  paymentStatus(@Request() req: any, @Param('reference') reference: string) {
    return this.service.paymentStatusForCabinet(this.tenantOf(req), reference);
  }

  /** Déclaration d'un paiement manuel (référence + justificatif facultatif). */
  @Post('/payments/:id/declare')
  @RequirePermissions('manage_subscription')
  @UseInterceptors(FileInterceptor('proof', { limits: { fileSize: 5 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Déclarer un paiement manuel (virement, Mobile Money…)' })
  declare(
    @Request() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { method_code?: string; reference?: string; note?: string },
    @UploadedFile() proof?: Express.Multer.File,
  ) {
    return this.service.declareManualPayment(
      this.tenantOf(req),
      id,
      {
        methodCode: String(dto?.method_code ?? ''),
        reference: String(dto?.reference ?? ''),
        note: dto?.note,
      },
      proof,
      cabinetUserActor(req.user),
    );
  }

  /** Reçu PDF d'un paiement encaissé du cabinet. */
  @Get('/payments/:id/receipt')
  @ApiOperation({ summary: 'Télécharger le reçu (PDF)' })
  async receipt(
    @Request() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.receipts.pdf(id, this.tenantOf(req));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  /** Justificatif déposé par le cabinet (lecture par le cabinet lui-même). */
  @Get('/payments/:id/proof')
  @ApiOperation({ summary: 'Télécharger le justificatif déposé' })
  async proof(
    @Request() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response,
  ) {
    const file = await this.service.proofFileForCabinet(this.tenantOf(req), id);
    res.setHeader('Content-Type', file.mime);
    res.setHeader('Content-Disposition', 'inline; filename="justificatif"');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.sendFile(file.path);
  }

  /** [TEST] Simule un encaissement réussi (passerelle de test uniquement). */
  @Post('/payments/simulate')
  @RequirePermissions('manage_subscription')
  @ApiOperation({ summary: '[TEST] Simuler un paiement réussi' })
  simulate(@Request() req: any, @Body() dto: { payment_id?: number }) {
    return this.service.simulatePayment(this.tenantOf(req), dto?.payment_id);
  }

  // ── Outils DEV (403 en production) ─────────────────────────────────────────
  // Ces outils restent authentifiés mais sont autorisés pour un cabinet
  // suspendu. La protection prod est faite par assertDev() côté service.

  /** [DEV] Force la date de fin à now + days (négatif = passé). */
  @Patch('/dev/set-ends-in')
  @RequirePermissions('manage_subscription')
  @ApiOperation({ summary: '[DEV] Définir la date de fin à N jours' })
  devSetEndsIn(@Request() req: any, @Body() dto: { days?: number }) {
    return this.service.devSetEndsIn(
      this.tenantOf(req),
      Number(dto?.days ?? 0),
    );
  }

  /** [DEV] Termine l'essai en cours → bascule en période payante. */
  @Patch('/dev/end-trial-now')
  @RequirePermissions('manage_subscription')
  @ApiOperation({ summary: "[DEV] Terminer l'essai (passage en payant)" })
  devEndTrialNow(@Request() req: any) {
    return this.service.devEndTrialNow(this.tenantOf(req));
  }

  /** [DEV] Expire immédiatement l'abonnement (suspend le cabinet). */
  @Patch('/dev/expire-now')
  @RequirePermissions('manage_subscription')
  @ApiOperation({ summary: '[DEV] Expirer immédiatement' })
  devExpireNow(@Request() req: any) {
    return this.service.devExpireNow(this.tenantOf(req));
  }

  /** [DEV] Recrée un essai neuf pour le plan courant. */
  @Patch('/dev/reset-trial')
  @RequirePermissions('manage_subscription')
  @ApiOperation({ summary: '[DEV] Réinitialiser un essai' })
  devResetTrial(@Request() req: any) {
    return this.service.devResetTrial(this.tenantOf(req));
  }
}
