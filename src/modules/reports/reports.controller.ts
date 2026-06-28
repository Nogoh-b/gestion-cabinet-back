import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
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
    summary: 'Rapport avancé agrégé (dossiers / audiences / finances) sur une période',
  })
  advanced(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('compare') compare?: string,
  ) {
    return this.reports.getAdvanced(from, to, compare === 'true' || compare === '1');
  }
}
