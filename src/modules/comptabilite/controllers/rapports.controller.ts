import { Controller, Get, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/core/common/guards/permissions.guard';
import { RequirePermissions } from 'src/core/decorators/permissions.decorator';

import { RapportsService } from '../services/rapports.service';

@ApiTags('comptabilite-rapports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('comptabilite/rapports')
export class RapportsController {
  constructor(private readonly service: RapportsService) {}

  @Get('balance')
  @RequirePermissions('view_accounting_reports')
  @ApiOperation({ summary: 'Balance des comptes' })
  @ApiQuery({ name: 'exerciceId', required: false })
  getBalance(@Query('exerciceId') exerciceId?: number) {
    return this.service.getBalance(exerciceId ? +exerciceId : undefined);
  }

  @Get('grand-livre/:compteId')
  @RequirePermissions('view_accounting_reports')
  @ApiOperation({ summary: "Grand livre d'un compte" })
  @ApiQuery({ name: 'exerciceId', required: false })
  getGrandLivre(
    @Param('compteId', ParseIntPipe) compteId: number,
    @Query('exerciceId') exerciceId?: number,
  ) {
    return this.service.getGrandLivre(compteId, exerciceId ? +exerciceId : undefined);
  }

  @Get('resultat')
  @RequirePermissions('view_accounting_reports')
  @ApiOperation({ summary: 'Compte de resultat' })
  @ApiQuery({ name: 'exerciceId', required: false })
  getResultat(@Query('exerciceId') exerciceId?: number) {
    return this.service.getResultat(exerciceId ? +exerciceId : undefined);
  }

  @Get('tva')
  @RequirePermissions('view_accounting_reports')
  @ApiOperation({ summary: 'Etat de TVA' })
  @ApiQuery({ name: 'exerciceId', required: false })
  @ApiQuery({ name: 'mois', required: false, description: 'Format YYYY-MM' })
  getTva(
    @Query('exerciceId') exerciceId?: number,
    @Query('mois') mois?: string,
  ) {
    return this.service.getTva(exerciceId ? +exerciceId : undefined, mois);
  }
}
