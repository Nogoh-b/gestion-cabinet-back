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

/**
 * Points d'entrée publics des passerelles (aucun cabinet, aucun jeton) :
 *  - POST /payments/webhooks/:provider : notification serveur (signée) ;
 *  - /payments/return/:provider        : retour navigateur → front.
 */
@ApiExcludeController()
@Controller('payments')
export class PaymentWebhooksController {
  constructor(private readonly webhooks: PaymentWebhooksService) {}

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
    const front = String(process.env.APP_FRONTEND_URL ?? '').replace(/\/+$/, '');
    const params = new URLSearchParams({
      ...(reference ? { payment_ref: String(reference) } : {}),
      payment_status: String(result.status),
    });
    res.redirect(303, `${front}/abonnement?${params.toString()}`);
  }
}
