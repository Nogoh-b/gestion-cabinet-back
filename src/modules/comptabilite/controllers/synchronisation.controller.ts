import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { SynchronisationService } from '../services/synchronisation.service';
import { InitialisationComptableService } from '../services/initialisation.service';
import { PermissionsGuard } from 'src/core/common/guards/permissions.guard';
import { RequirePermissions } from 'src/core/decorators/permissions.decorator';

@ApiTags('comptabilite-synchronisation')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('comptabilite/synchronisation')
export class SynchronisationController {
  constructor(
    private readonly service: SynchronisationService,
    private readonly initialisation: InitialisationComptableService,
  ) {}

  @Get('etat')
  @RequirePermissions('manage_chart_of_accounts')
  @ApiOperation({ summary: 'Aperçu : nombre de documents historiques à synchroniser' })
  etat() {
    return this.service.etat();
  }

  @Post('initialiser')
  @RequirePermissions('manage_chart_of_accounts')
  @ApiOperation({ summary: 'Crée le plan comptable du tenant courant (SYSCOHADA + journaux + exercice)' })
  initialiser() {
    return this.initialisation.initialiser();
  }

  @Post()
  @RequirePermissions('manage_chart_of_accounts')
  @ApiOperation({ summary: 'Lance la synchronisation initiale (backfill) — idempotent' })
  synchroniser() {
    return this.service.synchroniser();
  }
}
