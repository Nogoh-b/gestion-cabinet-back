import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PlatformRoute, PlatformRoles } from '../auth/platform-route.decorator';
import { PlatformAudit } from '../audit/platform-audit.decorator';
import {
  CurrentPlatformAdmin,
  PlatformPrincipal,
} from '../common/platform-principal';
import { PlatformSettingsService } from './platform-settings.service';

@ApiTags('Plateforme — Paramètres')
@Controller('platform/settings')
@PlatformRoute()
export class PlatformSettingsController {
  constructor(private readonly settings: PlatformSettingsService) {}

  @Get()
  @ApiOperation({ summary: 'Paramètres de la plateforme' })
  get() {
    return this.settings.getAll();
  }

  @Patch()
  @PlatformRoles('owner')
  @PlatformAudit({ action: 'settings.update', targetType: 'platform_settings' })
  @ApiOperation({ summary: 'Modifier les paramètres (Propriétaire)' })
  update(
    @Body() body: Record<string, any>,
    @CurrentPlatformAdmin() admin: PlatformPrincipal,
  ) {
    return this.settings.update(body, admin.id);
  }
}
