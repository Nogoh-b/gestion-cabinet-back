import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { BackupScope, BackupService } from 'src/modules/backup/backup.service';
import { PlatformRoute } from '../auth/platform-route.decorator';
import { PlatformAudit } from '../audit/platform-audit.decorator';

const FULL: BackupScope = { full: true };

/** Sauvegarde / restauration de la base complète (Propriétaire uniquement). */
@ApiTags('Plateforme — Sauvegardes')
@Controller('platform/backups')
@PlatformRoute('owner')
export class PlatformBackupsController {
  constructor(private readonly backup: BackupService) {}

  @Get()
  @ApiOperation({ summary: 'Lister toutes les sauvegardes' })
  list() {
    return this.backup.list(FULL);
  }

  @Post()
  @PlatformAudit({ action: 'backup.create', targetType: 'backup' })
  @ApiOperation({ summary: 'Créer une sauvegarde complète de la base' })
  create() {
    return this.backup.create(FULL);
  }

  @Get(':name/download')
  @PlatformAudit({ action: 'backup.download', targetType: 'backup', targetParam: 'name' })
  @ApiOperation({ summary: 'Télécharger une sauvegarde' })
  download(@Param('name') name: string, @Res() res: Response) {
    const { stream, name: file } = this.backup.streamFor(name, FULL);
    res.setHeader('Content-Type', 'application/sql');
    res.setHeader('Content-Disposition', `attachment; filename="${file}"`);
    stream.pipe(res);
  }

  @Post(':name/restore')
  @PlatformAudit({ action: 'backup.restore', targetType: 'backup', targetParam: 'name' })
  @ApiOperation({ summary: 'Restaurer la base (DANGEREUX)' })
  restore(@Param('name') name: string) {
    return this.backup.restore(name);
  }

  @Delete(':name')
  @PlatformAudit({ action: 'backup.delete', targetType: 'backup', targetParam: 'name' })
  @ApiOperation({ summary: 'Supprimer une sauvegarde' })
  remove(@Param('name') name: string) {
    this.backup.remove(name, FULL);
    return { success: true };
  }
}
