import { Controller, Get, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { RapportsService } from '../services/rapports.service';
import { PermissionsGuard } from 'src/core/common/guards/permissions.guard';
import { RequirePermissions } from 'src/core/decorators/permissions.decorator';

@ApiTags('comptabilite-rapports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('comptabilite/rapports')
export class RapportsController {
  constructor(private readonly service: RapportsService) {}

  @Get('balance')
  @RequirePermissions('view_accounting_reports')
  @ApiOperation({ summary: 'Balance des comptes (soldes débit/crédit par compte)' })
  @ApiQuery({ name: 'exerciceId', required: false })
  getBalance(@Query('exerciceId') exerciceId?: number) {
    return this.service.getBalance(exerciceId ? +exerciceId : undefined);
  }

  @Get('grand-livre/:compteId')
  @RequirePermissions('view_accounting_reports')
  @ApiOperation({ summary: "Grand livre d'un compte (tous les mouvements)" })
  @ApiQuery({ name: 'exerciceId', required: false })
  getGrandLivre(
    @Param('compteId', ParseIntPipe) compteId: number,
    @Query('exerciceId') exerciceId?: number,
  ) {
    return this.service.getGrandLivre(compteId, exerciceId ? +exerciceId : undefined);
  }

  @Get('resultat')
  @RequirePermissions('view_accounting_reports')
  @ApiOperation({ summary: 'Compte de résultat (charges vs produits)' })
  @ApiQuery({ name: 'exerciceId', required: false })
  getResultat(@Query('exerciceId') exerciceId?: number) {
    return this.service.getResultat(exerciceId ? +exerciceId : undefined);
  }

  @Get('tva')
  @RequirePermissions('view_accounting_reports')
  @ApiOperation({ summary: 'État de TVA (collectée vs déductible)' })
  @ApiQuery({ name: 'exerciceId', required: false })
  @ApiQuery({ name: 'mois', required: false, description: 'Format YYYY-MM' })
  getTva(
    @Query('exerciceId') exerciceId?: number,
    @Query('mois') mois?: string,
  ) {
    return this.service.getTva(exerciceId ? +exerciceId : undefined, mois);
  }
}
