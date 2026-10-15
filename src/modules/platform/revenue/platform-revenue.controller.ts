import { Controller, Get, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PlatformRoute, PlatformRoles } from '../auth/platform-route.decorator';
import { PlatformAudit } from '../audit/platform-audit.decorator';
import { PlatformRevenueService } from './platform-revenue.service';

@ApiTags('Plateforme — Revenus')
@Controller('platform')
@PlatformRoute()
export class PlatformRevenueController {
  constructor(private readonly revenue: PlatformRevenueService) {}

  /** Tableau de bord : tous les rôles (les montants détaillés restent visibles). */
  @Get('dashboard')
  @ApiOperation({ summary: 'Tableau de bord plateforme (KPI, 12 mois, à traiter)' })
  dashboard() {
    return this.revenue.dashboard();
  }

  @Get('revenue/overview')
  @PlatformRoles('finance')
  @ApiOperation({ summary: 'Synthèse financière d’une période (défaut : mois en cours)' })
  overview(@Query('from') from?: string, @Query('to') to?: string) {
    return this.revenue.overview(from, to);
  }

  @Get('revenue/monthly')
  @PlatformRoles('finance')
  @ApiOperation({ summary: 'Série mensuelle (année, ou à partir d’un mois sur N mois)' })
  monthly(
    @Query('year') year?: string,
    @Query('from') from?: string,
    @Query('months') months?: string,
  ) {
    return this.revenue.monthly({
      year: year ? Number(year) : undefined,
      from,
      months: months ? Number(months) : undefined,
    });
  }

  @Get('revenue/breakdown')
  @PlatformRoles('finance')
  @ApiOperation({ summary: 'Ventilation des encaissements (plan, method, cabinet, cycle)' })
  breakdown(
    @Query('by') by = 'plan',
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.revenue.breakdown(by, from, to);
  }

  @Get('revenue/export')
  @PlatformRoles('finance')
  @PlatformAudit({ action: 'revenue.export', targetType: 'revenue' })
  @ApiOperation({ summary: 'Export CSV de la série mensuelle' })
  async export(
    @Res() res: Response,
    @Query('year') year?: string,
    @Query('from') from?: string,
    @Query('months') months?: string,
  ) {
    const csv = await this.revenue.exportMonthlyCsv({
      year: year ? Number(year) : undefined,
      from,
      months: months ? Number(months) : undefined,
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="revenus-${year ?? from ?? new Date().getFullYear()}.csv"`,
    );
    res.send(csv);
  }
}
