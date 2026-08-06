import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/core/common/guards/permissions.guard';
import { RequirePermissions } from 'src/core/decorators/permissions.decorator';
import { CurrentUser } from 'src/core/decorators/current-user.decorator';
import { ResourceActor } from 'src/core/resource-policy.service';
import { DossierExportService } from './dossier-export.service';

@ApiTags('Export')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('exports')
export class ExportController {
  constructor(private readonly exportService: DossierExportService) {}

  private actor(user: any): ResourceActor {
    return {
      id: Number(user?.id),
      userId: Number(user?.userId ?? user?.id),
      tenantId: Number(
        user?.tenantId ??
          user?.tenant_id ??
          user?.cabinetId ??
          user?.cabinet_id,
      ),
      role: user?.role,
      permissions: Array.isArray(user?.permissions)
        ? user.permissions
        : [],
      customerId: user?.customerId ?? user?.customer_id ?? null,
    };
  }

  private auditContext(req: Request) {
    return {
      ip: req.ip,
      userAgent: req.get('user-agent') ?? null,
      requestId:
        String(
          req.headers['x-request-id'] ??
            req.headers['x-correlation-id'] ??
            '',
        ) || null,
    };
  }

  /** Export ZIP d'un dossier (documents + factures + paiements + métadonnées). */
  @Get('dossiers/:id')
  @RequirePermissions('view_dossiers')
  @ApiOperation({ summary: 'Exporter un dossier en ZIP' })
  exportOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    return this.exportService.streamZip(
      res,
      [id],
      this.actor(user),
      this.auditContext(req),
    );
  }

  /** Export ZIP de plusieurs dossiers (?ids=1,2,3) — un dossier par sous-dossier. */
  @Get('dossiers')
  @RequirePermissions('view_dossiers')
  @ApiOperation({ summary: 'Exporter plusieurs dossiers en ZIP (ids séparés par des virgules)' })
  exportMany(
    @Query('ids') ids: string,
    @CurrentUser() user: any,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const list = (ids ?? '')
      .split(',')
      .map((value) => value.trim())
      .map((value) => (/^\d+$/.test(value) ? Number(value) : NaN));
    return this.exportService.streamZip(
      res,
      list,
      this.actor(user),
      this.auditContext(req),
    );
  }
}
