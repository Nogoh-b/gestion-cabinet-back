import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Req,
  Res,
  ForbiddenException,
  UseGuards,
} from '@nestjs/common';
import { Response, Request } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { BackupScope, BackupService } from './backup.service';

@ApiTags('Backup')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('admin/backup')
export class BackupController {
  constructor(private readonly backup: BackupService) {}

  /** Admin du cabinet uniquement. */
  private assertAdmin(req: any): void {
    if (req?.user?.role !== 'admin') {
      throw new ForbiddenException("Réservé à l'administration");
    }
  }

  /**
   * Portée : toujours le cabinet courant. La sauvegarde/restauration de la
   * base complète relève de l'espace plateforme (`/platform/backups`).
   */
  private scopeOf(req: any): BackupScope {
    return { full: false, tenantId: req?.user?.tenantId };
  }

  @Get()
  @ApiOperation({ summary: 'Lister les sauvegardes du cabinet' })
  list(@Req() req: Request) {
    this.assertAdmin(req);
    return this.backup.list(this.scopeOf(req));
  }

  @Post()
  @ApiOperation({ summary: 'Créer une sauvegarde du cabinet' })
  create(@Req() req: Request) {
    this.assertAdmin(req);
    return this.backup.create(this.scopeOf(req));
  }

  @Get(':name/download')
  @ApiOperation({ summary: 'Télécharger une sauvegarde' })
  download(
    @Req() req: Request,
    @Param('name') name: string,
    @Res() res: Response,
  ) {
    this.assertAdmin(req);
    const { stream, name: file } = this.backup.streamFor(
      name,
      this.scopeOf(req),
    );
    res.setHeader('Content-Type', 'application/sql');
    res.setHeader('Content-Disposition', `attachment; filename="${file}"`);
    stream.pipe(res);
  }

  @Delete(':name')
  @ApiOperation({ summary: 'Supprimer une sauvegarde' })
  remove(@Req() req: Request, @Param('name') name: string) {
    this.assertAdmin(req);
    this.backup.remove(name, this.scopeOf(req));
    return { success: true };
  }
}
