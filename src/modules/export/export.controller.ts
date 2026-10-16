import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/core/common/guards/permissions.guard';
import { RequirePermissions } from 'src/core/decorators/permissions.decorator';
import { CurrentUser } from 'src/core/decorators/current-user.decorator';
import { DossierExportService } from './dossier-export.service';

@ApiTags('Export')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('exports')
export class ExportController {
  constructor(private readonly exportService: DossierExportService) {}

  /** Export ZIP d'un dossier (documents + factures + paiements + métadonnées). */
  @Get('dossiers/:id')
  @RequirePermissions('view_dossiers')
  @ApiOperation({ summary: 'Exporter un dossier en ZIP' })
  exportOne(
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response,
    @CurrentUser() user: any,
  ) {
    return this.exportService.streamZip(res, [id], user);
  }

  /** Export ZIP de plusieurs dossiers (?ids=1,2,3) — un dossier par sous-dossier. */
  @Get('dossiers')
  @RequirePermissions('view_dossiers')
  @ApiOperation({
    summary:
      'Exporter plusieurs dossiers en ZIP (ids séparés par des virgules)',
  })
  exportMany(
    @Query('ids') ids: string,
    @Res() res: Response,
    @CurrentUser() user: any,
  ) {
    const list = (ids ?? '')
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n));
    return this.exportService.streamZip(res, list, user);
  }
}
