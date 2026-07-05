import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/core/common/guards/permissions.guard';
import { RequirePermissions } from 'src/core/decorators/permissions.decorator';

import { InitialisationComptableService } from '../services/initialisation.service';
import { SynchronisationService } from '../services/synchronisation.service';

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
  @RequirePermissions('view_accounting')
  @ApiOperation({ summary: 'Apercu des documents historiques a synchroniser' })
  etat() {
    return this.service.etat();
  }

  @Post('initialiser')
  @RequirePermissions('manage_chart_of_accounts')
  @ApiOperation({ summary: 'Cree le plan comptable du tenant courant' })
  initialiser() {
    return this.initialisation.initialiser();
  }

  @Post()
  @RequirePermissions('manage_chart_of_accounts')
  @ApiOperation({ summary: 'Lance la synchronisation initiale' })
  synchroniser() {
    return this.service.synchroniser();
  }
}
