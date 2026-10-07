import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { ReportsService } from './reports.service';

@ApiTags('Reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  /** Rapport avancé — réservé aux plans incluant le module `reporting`. */
  @Get('advanced')
  @ApiOperation({
    summary:
      'Rapport avancé agrégé (dossiers / audiences / finances / diligences / documents) sur une période',
  })
  @ApiQuery({
    name: 'includeConfidential',
    required: false,
    type: Boolean,
    description:
      "Inclure les dossiers confidentiels dans les agrégats. Sans effet pour les utilisateurs qui n'y ont pas accès.",
  })
  advanced(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('compare') compare?: string,
    @Query('includeConfidential') includeConfidential?: string,
  ) {
    return this.reports.getAdvanced(
      from,
      to,
      compare === 'true' || compare === '1',
      // Simple préférence d'affichage : la sécurité est tranchée côté service
      // (un non-habilité n'agrège jamais de dossier confidentiel).
      includeConfidential === 'true' || includeConfidential === '1',
    );
  }
}
