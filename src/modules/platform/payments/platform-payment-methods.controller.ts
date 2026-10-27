import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PaymentMethodsService } from 'src/modules/subscriptions/payment/payment-methods.service';
import { PaymentProviderRegistry } from 'src/modules/subscriptions/payment/payment-provider.registry';
import { PlatformRoute, PlatformRoles } from '../auth/platform-route.decorator';
import { PlatformAudit } from '../audit/platform-audit.decorator';
import { PlatformAuditContext } from '../audit/platform-audit.context';
import { PaymentMethodDto } from './dto/platform-payment.dto';

const METHOD = { targetType: 'payment_method' };

/** Moyens de paiement des abonnements (configuration Propriétaire / Finance). */
@ApiTags('Plateforme — Moyens de paiement')
@Controller('platform/payment-methods')
@PlatformRoute()
export class PlatformPaymentMethodsController {
  constructor(
    private readonly methods: PaymentMethodsService,
    private readonly registry: PaymentProviderRegistry,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Moyens de paiement (secrets masqués, URL de webhook)' })
  list() {
    return this.methods.listForPlatform();
  }

  @Get(':id')
  detail(@Param('id', ParseIntPipe) id: number) {
    return this.methods.findForPlatform(id);
  }

  @Post()
  @PlatformRoles('finance')
  @PlatformAudit({ action: 'payment_method.create', ...METHOD })
  @ApiOperation({ summary: 'Ajouter un moyen de paiement (inactif à la création)' })
  async create(@Body() dto: PaymentMethodDto) {
    const created = await this.methods.create(dto);
    PlatformAuditContext.set({ targetId: created.id, after: created, summary: `Moyen ${created.label}` });
    return created;
  }

  @Patch(':id')
  @PlatformRoles('finance')
  @PlatformAudit({ action: 'payment_method.update', ...METHOD })
  @ApiOperation({ summary: 'Modifier (libellé, instructions, frais, clés…)' })
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: PaymentMethodDto) {
    const { before, after } = await this.methods.update(id, dto);
    PlatformAuditContext.set({
      before,
      after,
      summary: `Moyen ${after.label}${dto.secrets ? ' (clés modifiées)' : ''}`,
    });
    return after;
  }

  @Post(':id/activate')
  @HttpCode(HttpStatus.OK)
  @PlatformRoles('finance')
  @PlatformAudit({ action: 'payment_method.activate', ...METHOD })
  activate(@Param('id', ParseIntPipe) id: number) {
    return this.methods.setActive(id, true);
  }

  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @PlatformRoles('finance')
  @PlatformAudit({ action: 'payment_method.deactivate', ...METHOD })
  deactivate(@Param('id', ParseIntPipe) id: number) {
    return this.methods.setActive(id, false);
  }

  @Post(':id/test')
  @HttpCode(HttpStatus.OK)
  @PlatformRoles('finance')
  @PlatformAudit({ action: 'payment_method.test', ...METHOD })
  @ApiOperation({ summary: 'Tester les clés auprès de la passerelle' })
  async test(@Param('id', ParseIntPipe) id: number) {
    const view = await this.methods.findForPlatform(id);
    if (view.kind !== 'gateway' || !view.provider) {
      return { ok: true, message: 'Moyen manuel : aucune connexion à tester.' };
    }
    const method = await this.methods.findById(id);
    const ctx = await this.methods.contextFor(method!);
    const result = await this.registry.get(view.provider).testConnection(ctx);
    PlatformAuditContext.set({ summary: result.message });
    return result;
  }
}
