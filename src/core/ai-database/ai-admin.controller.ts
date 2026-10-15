import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AppSettingsService } from 'src/modules/settings/services/app-settings.service';
import { AiModelRouterService } from './ai-model-router.service';
import { hasCabinetOverride } from './ai-provider-config';

/**
 * Vue CABINET du moteur IA : lecture seule.
 *
 * Le choix des fournisseurs et des modèles est géré par la console plateforme
 * (module « Intelligence artificielle ») : moteur par défaut de tous les
 * cabinets et, au besoin, exception pour un cabinet. Le cabinet ne fait que
 * consulter le moteur qui lui est attribué. Aucune clé n'est exposée.
 */
@ApiTags('AI Admin')
@ApiBearerAuth()
@Controller('api/ai-admin')
@UseGuards(JwtAuthGuard)
export class AiAdminController {
  constructor(
    private readonly router: AiModelRouterService,
    private readonly appSettings: AppSettingsService,
  ) {}

  @Get('status')
  @ApiOperation({ summary: 'Moteur IA attribué au cabinet (géré par la plateforme)' })
  async status(@Req() req: Request) {
    this.assertAdmin(req);
    const tenantId = this.tenantId(req);

    const cabinetConfig = await this.appSettings.getAiConfig(tenantId);
    const platformConfig = await this.router.loadPlatformConfig();
    const { effective } = await this.router.getEffectiveConfigAsync(tenantId);

    const source: 'cabinet' | 'platform' | 'env' = hasCabinetOverride(cabinetConfig)
      ? 'cabinet'
      : platformConfig?.active_provider
        ? 'platform'
        : 'env';

    const fallback = this.router.getEffectiveConfigSync('quality', 'balanced');
    const providerId = effective?.providerId ?? null;
    const provider = providerId ? this.router.getBuiltinProvider(providerId) : undefined;
    const customLabel = providerId ? platformConfig?.providers?.[providerId]?.label : undefined;

    return {
      managed_by: 'platform' as const,
      source,
      provider_id: providerId,
      provider_label: provider?.label ?? customLabel ?? providerId ?? 'Configuration serveur',
      model: effective?.model ?? fallback.model,
      has_api_key: effective ? !!effective.apiKey : fallback.hasApiKey,
    };
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
