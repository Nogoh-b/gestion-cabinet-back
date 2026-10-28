import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { DataSource } from 'typeorm';
import { DossierDeletionService } from 'src/modules/dossiers/deletion/dossier-deletion.service';
import { DeleteDossierDto } from 'src/modules/dossiers/dto/delete-dossier.dto';
import { PlatformAudit } from '../audit/platform-audit.decorator';
import { PlatformAuditContext } from '../audit/platform-audit.context';
import { PlatformRoles, PlatformRoute } from '../auth/platform-route.decorator';
import { CurrentPlatformAdmin, PlatformPrincipal } from '../common/platform-principal';
import {
  PlatformSampleDataService,
  SAMPLE_TYPES,
  SampleSize,
  SampleType,
} from './platform-sample-data.service';

class GenerateSampleDataDto {
  @IsArray()
  @ArrayNotEmpty({ message: 'Choisissez au moins un type de données à générer.' })
  @IsIn(SAMPLE_TYPES, { each: true, message: 'Type de données inconnu.' })
  types: SampleType[];

  @IsIn(['petit', 'moyen', 'grand'], { message: 'Volume invalide.' })
  size: SampleSize;
}

class RemoveSampleDataQuery {
  @ApiPropertyOptional({ enum: SAMPLE_TYPES, description: 'Absent : tout réinitialiser' })
  @IsOptional()
  @IsIn(SAMPLE_TYPES, { message: 'Type de données inconnu.' })
  type?: SampleType;
}

class CabinetDossiersQuery {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}

const CABINET = { targetType: 'cabinet', cabinetParam: 'id' };

/**
 * Données d'un cabinet pilotées par la plateforme : jeux de données de test
 * et suppression (corbeille) / restauration de dossiers.
 */
@ApiTags('Plateforme — Données des cabinets')
@Controller('platform/cabinets/:id')
@PlatformRoute()
export class PlatformCabinetDataController {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly sampleData: PlatformSampleDataService,
    private readonly deletion: DossierDeletionService,
  ) {}

  // ── Données de test ─────────────────────────────────────────────────────

  @Get('sample-data')
  @ApiOperation({ summary: 'Données de test présentes dans le cabinet' })
  sampleSummary(@Param('id', ParseIntPipe) id: number) {
    return this.sampleData.summary(id);
  }

  @Post('sample-data')
  @HttpCode(HttpStatus.OK)
  @PlatformRoles('support')
  @PlatformAudit({ action: 'cabinet.sample_data.generate', ...CABINET })
  @ApiOperation({ summary: 'Générer des données de test (statuts variés)' })
  generate(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: GenerateSampleDataDto,
    @CurrentPlatformAdmin() admin: PlatformPrincipal,
  ) {
    return this.sampleData.generate(id, dto.types, dto.size, admin);
  }

  @Delete('sample-data')
  @PlatformRoles('support')
  @PlatformAudit({ action: 'cabinet.sample_data.remove', ...CABINET })
  @ApiOperation({ summary: 'Retirer un type de données de test (en cascade) ou tout réinitialiser' })
  removeSample(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: RemoveSampleDataQuery,
    @CurrentPlatformAdmin() admin: PlatformPrincipal,
  ) {
    return this.sampleData.remove(id, query.type, admin);
  }

  // ── Dossiers ────────────────────────────────────────────────────────────

  @Get('dossiers')
  @ApiOperation({ summary: 'Dossiers du cabinet' })
  async dossiers(@Param('id', ParseIntPipe) id: number, @Query() query: CabinetDossiersQuery) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const params: any[] = [id];
    let where = 'd.tenant_id = ? AND d.deleted_at IS NULL';
    if (query.search?.trim()) {
      const like = `%${query.search.trim()}%`;
      where += ' AND (d.dossier_number LIKE ? OR d.object LIKE ? OR c.full_name LIKE ?)';
      params.push(like, like, like);
    }
    const rows = await this.db.query(
      `SELECT d.id, d.dossier_number, d.object, d.status, d.opening_date, d.created_at,
              c.full_name AS client_name,
              EXISTS (SELECT 1 FROM sample_data_records r
                       WHERE r.tenant_id = d.tenant_id AND r.entity = 'dossiers' AND r.entity_id = d.id) AS is_sample
         FROM dossiers d LEFT JOIN customer c ON c.id = d.client_id
        WHERE ${where}
        ORDER BY d.created_at DESC, d.id DESC
        LIMIT ? OFFSET ?`,
      [...params, limit, (page - 1) * limit],
    );
    const [{ total }] = await this.db.query(
      `SELECT COUNT(*) AS total FROM dossiers d LEFT JOIN customer c ON c.id = d.client_id WHERE ${where}`,
      params,
    );
    return {
      data: rows.map((r: any) => ({ ...r, status: Number(r.status), is_sample: !!Number(r.is_sample) })),
      meta: { total: Number(total), page, limit, totalPages: Math.ceil(Number(total) / limit) },
    };
  }

  @Get('dossier-deletions')
  @ApiOperation({ summary: 'Corbeille : dossiers supprimés' })
  deletions(@Param('id', ParseIntPipe) id: number) {
    return this.deletion.listDeletions(id);
  }

  @Get('dossiers/:dossierId/deletion-preview')
  @ApiOperation({ summary: 'Éléments liés à un dossier, avant suppression' })
  preview(
    @Param('id', ParseIntPipe) id: number,
    @Param('dossierId', ParseIntPipe) dossierId: number,
  ) {
    return this.deletion.preview(id, dossierId);
  }

  @Post('dossiers/:dossierId/delete')
  @HttpCode(HttpStatus.OK)
  @PlatformRoles('support')
  @PlatformAudit({ action: 'cabinet.dossier.delete', ...CABINET })
  @ApiOperation({ summary: 'Supprimer un dossier et les éléments liés choisis (corbeille)' })
  async deleteDossier(
    @Param('id', ParseIntPipe) id: number,
    @Param('dossierId', ParseIntPipe) dossierId: number,
    @Body() dto: DeleteDossierDto,
    @CurrentPlatformAdmin() admin: PlatformPrincipal,
  ) {
    const result = await this.deletion.delete(id, dossierId, {
      include: dto.include ?? [],
      mode: 'soft',
      actor: `${admin.email} (plateforme)`,
      allowLocked: true,
    });
    PlatformAuditContext.set({
      action: 'cabinet.dossier.delete',
      targetType: 'cabinet',
      targetId: id,
      cabinetId: id,
      summary: `Dossier ${result.dossier_number} mis à la corbeille${
        dto.include?.length ? ` avec : ${dto.include.join(', ')}` : ''
      }`,
    });
    return result;
  }

  @Post('dossier-deletions/:deletionId/restore')
  @HttpCode(HttpStatus.OK)
  @PlatformRoles('support')
  @PlatformAudit({ action: 'cabinet.dossier.restore', ...CABINET })
  @ApiOperation({ summary: 'Restaurer un dossier supprimé et ses éléments' })
  async restore(
    @Param('id', ParseIntPipe) id: number,
    @Param('deletionId', ParseIntPipe) deletionId: number,
  ) {
    const result = await this.deletion.restore(id, deletionId);
    PlatformAuditContext.set({
      action: 'cabinet.dossier.restore',
      targetType: 'cabinet',
      targetId: id,
      cabinetId: id,
      summary: `Dossier ${result.dossier_number} restauré`,
    });
    return result;
  }
}
