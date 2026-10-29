import {
  Controller,
  Delete,
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
import { DossierExportStore } from './dossier-export.store';

@ApiTags('Export')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('exports')
export class ExportController {
  constructor(
    private readonly exportService: DossierExportService,
    private readonly store: DossierExportStore,
  ) {}

  /** Exports conservés sur le serveur : les siens, ou tous ceux du cabinet pour un administrateur. */
  @Get()
  @RequirePermissions('view_dossiers')
  @ApiOperation({ summary: 'Lister mes exports de dossiers' })
  list(@CurrentUser() user: any) {
    return this.store.list(user);
  }

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

  /** Retélécharge un export déjà produit. */
  @Get(':id/download')
  @RequirePermissions('view_dossiers')
  @ApiOperation({ summary: 'Télécharger un export conservé' })
  async download(
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response,
    @CurrentUser() user: any,
  ) {
    const { absPath, fileName } = await this.store.downloadable(id, user);
    res.download(absPath, fileName);
  }

  /** Supprime le ZIP et sa ligne : l'espace est libéré. */
  @Delete(':id')
  @RequirePermissions('view_dossiers')
  @ApiOperation({ summary: 'Supprimer un export (fichier + enregistrement)' })
  async remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    await this.store.remove(id, user);
    return { deleted: true };
  }
}
