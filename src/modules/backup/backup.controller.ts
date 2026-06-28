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

  private isSuperAdmin(req: any): boolean {
    return (req?.user?.permissions ?? []).includes('SUPER_ADMIN');
  }

  /** Admin du cabinet OU super-admin. */
  private assertAdmin(req: any): void {
    if (req?.user?.role !== 'admin' && !this.isSuperAdmin(req)) {
      throw new ForbiddenException("Réservé à l'administration");
    }
  }

  /** Portée : super-admin = toute la base ; sinon = le cabinet courant. */
  private scopeOf(req: any): BackupScope {
    const full = this.isSuperAdmin(req);
    return { full, tenantId: full ? undefined : req?.user?.tenantId };
  }

  @Get()
  @ApiOperation({ summary: 'Lister les sauvegardes (scopées au cabinet, ou toutes si super-admin)' })
  list(@Req() req: Request) {
    this.assertAdmin(req);
    return this.backup.list(this.scopeOf(req));
  }

  @Post()
  @ApiOperation({ summary: 'Créer une sauvegarde (cabinet, ou complète si super-admin)' })
  create(@Req() req: Request) {
    this.assertAdmin(req);
    return this.backup.create(this.scopeOf(req));
  }

  @Get(':name/download')
  @ApiOperation({ summary: 'Télécharger une sauvegarde' })
  download(@Req() req: Request, @Param('name') name: string, @Res() res: Response) {
    this.assertAdmin(req);
    const { stream, name: file } = this.backup.streamFor(name, this.scopeOf(req));
    res.setHeader('Content-Type', 'application/sql');
    res.setHeader('Content-Disposition', `attachment; filename="${file}"`);
    stream.pipe(res);
  }

  @Post(':name/restore')
  @ApiOperation({ summary: 'Restaurer la base (DANGEREUX — super-admin uniquement)' })
  restore(@Req() req: Request, @Param('name') name: string) {
    if (!this.isSuperAdmin(req)) {
      throw new ForbiddenException('Restauration réservée au super-administrateur');
    }
    return this.backup.restore(name);
  }

  @Delete(':name')
  @ApiOperation({ summary: 'Supprimer une sauvegarde' })
  remove(@Req() req: Request, @Param('name') name: string) {
    this.assertAdmin(req);
    this.backup.remove(name, this.scopeOf(req));
    return { success: true };
  }
}
