import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Req,
  UseGuards,
  Body,
  Put,
  Post,
  Delete,
  Param,
  Optional,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AppSettingsService } from 'src/modules/settings/services/app-settings.service';
import { AiModelRouterService } from './ai-model-router.service';
import { hasCabinetOverride } from './ai-provider-config';
import { CabinetAiSettingsService } from './cabinet-ai-settings.service';
import { AiPlanChoiceDto } from 'src/modules/plans/dto/ai-plan-policy.dto';
import { IsOptional, IsString, MaxLength } from 'class-validator';

class CabinetCustomProviderDto {
  @IsOptional() @IsString() @MaxLength(80) label?: string;
  @IsOptional() @IsString() @MaxLength(500) base_url?: string;
  @IsOptional() @IsString() @MaxLength(160) model?: string;
  @IsOptional() @IsString() @MaxLength(1000) api_key?: string;
}

/**
 * Vue cabinet : droits de choix et de configuration définis par le forfait.
 *
 * Le choix des fournisseurs et des modèles est géré par la console plateforme
 * (module « Intelligence artificielle ») : moteur par défaut de tous les
 * cabinets et, au besoin, exception pour un cabinet. Le cabinet ne fait que
 * consulter le moteur attribué et utiliser les options de son forfait. Aucune clé n'est exposée.
 */
@ApiTags('AI Admin')
@ApiBearerAuth()
@Controller('api/ai-admin')
@UseGuards(JwtAuthGuard)
export class AiAdminController {
  constructor(
    private readonly router: AiModelRouterService,
    private readonly appSettings: AppSettingsService,
    @Optional() private readonly cabinetAi?: CabinetAiSettingsService,
  ) {}

  @Get('status')
  @ApiOperation({
    summary: 'Moteur IA attribué au cabinet (géré par la plateforme)',
  })
  async status(@Req() req: Request) {
    this.assertAdmin(req);
    const tenantId = this.tenantId(req);

    const cabinetConfig = await this.appSettings.getAiConfig(tenantId);
    const platformConfig = await this.router.loadPlatformConfig();
    const { effective } = await this.router.getEffectiveConfigAsync(tenantId);

    const source: 'cabinet' | 'platform' | 'env' = hasCabinetOverride(
      cabinetConfig,
    )
      ? 'cabinet'
      : platformConfig?.active_provider
        ? 'platform'
        : 'env';

    const fallback = this.router.getEffectiveConfigSync('quality', 'balanced');
    const providerId = effective?.providerId ?? null;
    const provider = providerId
      ? this.router.getBuiltinProvider(providerId)
      : undefined;
    const customLabel = providerId
      ? platformConfig?.providers?.[providerId]?.label
      : undefined;
    const access = this.cabinetAi
      ? await this.cabinetAi.access(tenantId)
      : undefined;

    return {
      managed_by: 'platform' as const,
      provider_id: providerId,
      provider_label:
        provider?.label ??
        customLabel ??
        (providerId
          ? cabinetConfig?.providers?.[providerId]?.label
          : undefined) ??
        providerId ??
        'Configuration serveur',
      model: effective?.model ?? fallback.model,
      has_api_key: effective ? !!effective.apiKey : fallback.hasApiKey,
      ...(access ?? {
        can_select_model: false,
        can_add_custom_provider: false,
        choices: [],
        custom_providers: [],
      }),
      source: access?.source ?? source,
    };
  }

  @Put('selection')
  async select(@Req() req: Request, @Body() choice: AiPlanChoiceDto) {
    this.assertAdmin(req);
    await this.cabinetAi!.select(this.tenantId(req), choice);
    return this.status(req);
  }

  @Delete('selection')
  async reset(@Req() req: Request) {
    this.assertAdmin(req);
    await this.cabinetAi!.reset(this.tenantId(req));
    return this.status(req);
  }

  @Post('providers')
  async createProvider(
    @Req() req: Request,
    @Body() body: CabinetCustomProviderDto,
  ) {
    this.assertAdmin(req);
    await this.cabinetAi!.saveCustom(this.tenantId(req), body);
    return this.status(req);
  }

  @Put('providers/:id')
  async updateProvider(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: CabinetCustomProviderDto,
  ) {
    this.assertAdmin(req);
    await this.cabinetAi!.saveCustom(this.tenantId(req), body, id);
    return this.status(req);
  }

  @Delete('providers/:id')
  async deleteProvider(@Req() req: Request, @Param('id') id: string) {
    this.assertAdmin(req);
    await this.cabinetAi!.deleteCustom(this.tenantId(req), id);
    return this.status(req);
  }

  private assertAdmin(req: Request): void {
    const user = req.user as any;
    const superAdmin =
      Array.isArray(user?.permissions) &&
      user.permissions.includes('SUPER_ADMIN');
    if (user?.role !== 'admin' && !superAdmin) {
      throw new ForbiddenException("Reserve a l'administration");
    }
  }

  private tenantId(req: Request): number {
    const tenantId = Number((req.user as any)?.tenantId);
    if (!Number.isInteger(tenantId) || tenantId <= 0) {
      throw new BadRequestException('Cabinet courant invalide');
    }
    return tenantId;
  }
}
