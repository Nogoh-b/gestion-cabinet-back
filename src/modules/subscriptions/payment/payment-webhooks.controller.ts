import {
  All,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Response } from 'express';
import { Public } from 'src/core/decorators/public.decorator';
import { PaymentWebhooksService } from './payment-webhooks.service';
import { Body } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CouponsService } from '../coupons/coupons.service';
import { PlansService } from 'src/modules/plans/plans.service';
import { planPriceForCycle } from '../subscriptions.policy';
import { frontendPublicUrl } from './payment-methods.service';

/**
 * Points d'entrée publics des passerelles (aucun cabinet, aucun jeton) :
 *  - POST /payments/webhooks/:provider : notification serveur (signée) ;
 *  - /payments/return/:provider        : retour navigateur → front.
 */
@ApiExcludeController()
@Controller('payments')
export class PaymentWebhooksController {
  constructor(
    private readonly webhooks: PaymentWebhooksService,
    private readonly coupons: CouponsService,
    private readonly plans: PlansService,
  ) {}

  /** Aperçu d'un code promo pour un plan et un cycle (public, limité en débit). */
  @Public()
  @Post('coupons/quote')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async quote(
    @Body() body: { code?: string; plan_code?: string; plan_id?: number; cycle?: 'monthly' | 'yearly' },
  ) {
    const plan = body?.plan_id
      ? await this.plans.findOne(Number(body.plan_id)).catch(() => null)
      : await this.plans.findByCode(String(body?.plan_code ?? ''));
    const cycle = body?.cycle === 'yearly' ? 'yearly' : 'monthly';
    const amount = planPriceForCycle(plan, cycle);
    const q = await this.coupons.quote(String(body?.code ?? ''), {
      planId: plan?.id ?? null,
      cycle,
      amount,
      currency: 'XAF',
    });
    return {
      code: q.coupon.code,
      description: q.coupon.description,
      type: q.coupon.type,
      value: Number(q.coupon.value),
      duration_cycles: q.coupon.duration_cycles,
      gross: q.gross,
      discount: q.discount,
      net: q.net,
      free_months: q.free_months,
    };
  }

  @Public()
  @Post('webhooks/:provider')
  @HttpCode(HttpStatus.OK)
  receive(@Param('provider') provider: string, @Req() req: any) {
    return this.webhooks.handle(provider, {
      headers: req.headers ?? {},
      rawBody: req.rawBody ?? null,
      body: req.body ?? {},
    });
  }

  /** Certaines passerelles (CinetPay) testent l'URL de notification en GET. */
  @Public()
  @Get('webhooks/:provider')
  ping() {
    return { ok: true };
  }

  @Public()
  @All('return/:provider')
  async return(
    @Query('ref') ref: string | undefined,
    @Query('cancelled') cancelled: string | undefined,
    @Req() req: any,
    @Res() res: Response,
  ) {
    // CinetPay renvoie la référence en POST (transaction_id).
    const reference = ref ?? req.body?.transaction_id ?? req.body?.cpm_trans_id ?? null;
    const result = cancelled ? { status: 'cancelled' } : await this.webhooks.handleReturn(reference);
    const front = frontendPublicUrl();
    const params = new URLSearchParams({
      ...(reference ? { payment_ref: String(reference) } : {}),
      payment_status: String(result.status),
    });
    res.redirect(303, `${front}/abonnement?${params.toString()}`);
  }
}
