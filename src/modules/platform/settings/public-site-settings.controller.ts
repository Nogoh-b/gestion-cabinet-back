import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from 'src/core/decorators/public.decorator';
import { PlatformSettingsService } from './platform-settings.service';

/**
 * Réglages du mini-site lus par la page d'accueil, avant toute connexion.
 * N'expose que la section `site` (aucune donnée sensible).
 */
@ApiTags('Site public')
@Controller('site/settings')
@Public()
export class PublicSiteSettingsController {
  constructor(private readonly settings: PlatformSettingsService) {}

  @Get()
  @ApiOperation({ summary: 'Comportement de la page d’accueil (public)' })
  get() {
    return this.settings.get('site');
  }
}
