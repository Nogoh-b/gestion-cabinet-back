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
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PlatformRoute, PlatformRoles } from '../auth/platform-route.decorator';
import { PlatformAudit } from '../audit/platform-audit.decorator';
import {
  CurrentPlatformAdmin,
  PlatformPrincipal,
} from '../common/platform-principal';
import { PlatformPaymentsService } from './platform-payments.service';
import { ReceiptService } from 'src/modules/subscriptions/billing/receipt.service';
import {
  PlatformPaymentQueryDto,
  RefundPaymentDto,
  RejectPaymentDto,
  ValidatePaymentDto,
  WaivePaymentDto,
} from './dto/platform-payment.dto';

const PAYMENT = { targetType: 'payment' };

@ApiTags('Plateforme — Paiements')
@Controller('platform/payments')
@PlatformRoute()
export class PlatformPaymentsController {
  constructor(
    private readonly service: PlatformPaymentsService,
    private readonly receipts: ReceiptService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Paiements de tous les cabinets (filtres, totaux)' })
  list(@Query() query: PlatformPaymentQueryDto) {
    return this.service.list(query);
  }

  @Get('export')
  @PlatformRoles('finance')
  @PlatformAudit({ action: 'payment.export', targetType: 'payment' })
  @ApiOperation({ summary: 'Export CSV des paiements filtrés' })
  async export(@Query() query: PlatformPaymentQueryDto, @Res() res: Response) {
    const csv = await this.service.exportCsv(query);
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="paiements-${stamp}.csv"`);
    res.send(csv);
  }

  @Get('webhooks')
  @PlatformRoles('finance')
  @ApiOperation({ summary: 'Dernières notifications reçues des passerelles' })
  webhooks(@Query('limit') limit?: string) {
    return this.service.webhookEvents(Number(limit) || 100);
  }

  @Get(':id')
  detail(@Param('id', ParseIntPipe) id: number) {
    return this.service.detail(id);
  }

  @Get(':id/receipt')
  @PlatformAudit({ action: 'payment.receipt', ...PAYMENT })
  @ApiOperation({ summary: 'Reçu PDF du paiement' })
  async receipt(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const { buffer, filename } = await this.receipts.pdf(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  @Get(':id/proof')
  @ApiOperation({ summary: 'Justificatif déposé par le cabinet' })
  async proof(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const file = await this.service.proof(id);
    res.setHeader('Content-Type', file.mime);
    res.setHeader('Content-Disposition', 'inline; filename="justificatif"');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.sendFile(file.path);
  }

  @Post(':id/validate')
  @HttpCode(HttpStatus.OK)
  @PlatformRoles('finance')
  @PlatformAudit({ action: 'payment.validate', ...PAYMENT })
  @ApiOperation({ summary: 'Valider un paiement déclaré / en attente' })
  validate(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ValidatePaymentDto,
    @CurrentPlatformAdmin() admin: PlatformPrincipal,
  ) {
    return this.service.validate(id, dto, admin);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @PlatformRoles('finance')
  @PlatformAudit({ action: 'payment.reject', ...PAYMENT })
  @ApiOperation({ summary: 'Rejeter une déclaration de paiement' })
  reject(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RejectPaymentDto,
    @CurrentPlatformAdmin() admin: PlatformPrincipal,
  ) {
    return this.service.reject(id, dto.reason, admin);
  }

  @Post(':id/refund')
  @HttpCode(HttpStatus.OK)
  @PlatformRoles('finance')
  @PlatformAudit({ action: 'payment.refund', ...PAYMENT })
  @ApiOperation({ summary: 'Rembourser (total ou partiel)' })
  refund(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RefundPaymentDto,
    @CurrentPlatformAdmin() admin: PlatformPrincipal,
  ) {
    return this.service.refund(id, dto, admin);
  }

  @Post(':id/waive')
  @HttpCode(HttpStatus.OK)
  @PlatformRoles('finance')
  @PlatformAudit({ action: 'payment.waive', ...PAYMENT })
  @ApiOperation({ summary: 'Annuler une échéance due (geste commercial)' })
  waive(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: WaivePaymentDto,
    @CurrentPlatformAdmin() admin: PlatformPrincipal,
  ) {
    return this.service.waive(id, dto.reason, admin);
  }
}
