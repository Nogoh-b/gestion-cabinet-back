import {
  Controller,
  Get,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CabinetService } from './cabinet.service';
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/core/common/guards/permissions.guard';
import { Public } from 'src/core/decorators/public.decorator';

@ApiTags('Cabinets (SaaS)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('cabinets')
export class CabinetController {
  constructor(private readonly service: CabinetService) {}

  /**
   * ⚠️ Routes statiques EN PREMIER — avant les routes paramétriques (:id).
   * NestJS mappe dans l'ordre de définition. Si @Get(':id') était avant,
   * il intercepterait "resolve" et échouerait sur ParseIntPipe.
   */

  /** Résolution publique d'un code → branding complet du cabinet (logo, slogan, nom…)
   *  pour la page de login (avant authentification).
   *  La configuration vit directement dans la table `cabinets`. */
  @Get('resolve/:code')
  @Public() // pas d'auth requise
  @ApiOperation({
    summary:
      'Résoudre un code cabinet → branding complet (nom, logo, slogan, statut)',
  })
  async resolve(@Param('code') code: string) {
    const merged = await this.service.resolveWithSettings(code);
    if (!merged) return { found: false };
    return {
      data: merged,
      found: true,
    };
  }

  // La gestion des cabinets (liste, création, suspension, réactivation,
  // branding) relève exclusivement de l'espace plateforme : /platform/cabinets.
}
