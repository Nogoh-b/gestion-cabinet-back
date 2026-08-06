import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { In } from 'typeorm';
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/core/common/guards/permissions.guard';
import { CurrentUser } from 'src/core/decorators/current-user.decorator';
import { RequirePermissions } from 'src/core/decorators/permissions.decorator';
import { ResourcePolicyService } from 'src/core/resource-policy.service';
import { PaginationParamsDto } from 'src/core/shared/dto/pagination-params.dto';
import { SearchCriteria } from 'src/core/shared/services/search/base-v1.service';
import { DiligenceStatsService } from './diligence-stats.service';
import { DiligencesService } from './diligence.service';
import { CreateDiligenceDto } from './dto/create-diligence.dto';
import { DiligenceResponseDto } from './dto/response-diligence.dto';
import { DiligenceSearchDto } from './dto/search-diligence.dto';
import { UpdateDiligenceDto } from './dto/update-diligence.dto';

@ApiTags('Diligences')
@ApiBearerAuth()
@Controller('diligences')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DiligencesController {
  constructor(
    private readonly diligencesService: DiligencesService,
    private readonly statsService: DiligenceStatsService,
    private readonly resourcePolicy: ResourcePolicyService,
  ) {}

  @Get('stats')
  @RequirePermissions('view_diligences')
  @ApiOperation({ summary: 'Obtenir les statistiques des diligences accessibles' })
  async getStats(
    @Query('startDate') startDate: string | undefined,
    @Query('endDate') endDate: string | undefined,
    @Query('lawyerId') lawyerId: number | undefined,
    @Query('dossierId') dossierId: number | undefined,
    @CurrentUser() user: any,
  ): Promise<any> {
    const dossierIds = await this.accessibleDossierIds(user);
    if (dossierId && !dossierIds.includes(Number(dossierId))) {
      await this.resourcePolicy.assertDossierAccess(
        Number(dossierId),
        user,
        'read',
        'view_diligences',
        1,
      );
    }
    return this.statsService.getStats({
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      lawyerId: lawyerId ? Number(lawyerId) : undefined,
      dossierId: dossierId ? Number(dossierId) : undefined,
      dossierIds,
    });
  }

  @Get('stats/:id')
  @RequirePermissions('view_diligences')
  async getStatsForDiligence(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
  ) {
    await this.assertDiligenceAccess(id, user, 'read', 'view_diligences');
    return this.statsService.getStats({ diligenceId: id });
  }

  @Get('upcoming')
  @RequirePermissions('view_diligences')
  async getUpcomingDeadlines(@CurrentUser() user: any) {
    const stats = await this.statsService.getStats({
      dossierIds: await this.accessibleDossierIds(user),
    });
    return (stats as any).upcomingDeadlines;
  }

  @Get('upcoming/deadlines')
  @RequirePermissions('view_diligences')
  async findUpcomingDeadlines(
    @Query('days') days: number = 7,
    @CurrentUser() user: any,
  ) {
    return this.diligencesService.findUpcomingDeadlines(
      Number(days) || 7,
      await this.accessibleDossierIds(user),
    );
  }

  @Get('overdue')
  @RequirePermissions('view_diligences')
  async findOverdue(@CurrentUser() user: any) {
    return this.diligencesService.findOverdue(
      await this.accessibleDossierIds(user),
    );
  }

  @Get('search')
  @RequirePermissions('view_diligences')
  @ApiResponse({ status: 200, type: [DiligenceResponseDto] })
  async search(
    @Query() searchParams: DiligenceSearchDto,
    @Query() paginationParams: PaginationParamsDto,
    @CurrentUser() user: any,
  ) {
    const dossierIds = await this.accessibleDossierIds(user);
    return this.diligencesService.searchWithTransformer(
      {
        ...(searchParams as SearchCriteria),
        dossier_id: In(dossierIds.length > 0 ? dossierIds : [-1]),
      },
      DiligenceResponseDto,
      paginationParams,
    );
  }

  @Get()
  @RequirePermissions('view_diligences')
  async findAll(@CurrentUser() user: any) {
    return this.diligencesService.findAll(
      await this.accessibleDossierIds(user),
    );
  }

  @Post()
  @RequirePermissions('create_diligence')
  async create(
    @Body() dto: CreateDiligenceDto,
    @CurrentUser() user: any,
  ) {
    await this.resourcePolicy.assertDossierAccess(
      dto.dossier_id,
      user,
      'write',
      'create_diligence',
      1,
    );
    return this.diligencesService.create(dto, this.actorId(user));
  }

  @Get(':id')
  @RequirePermissions('view_diligences')
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
  ) {
    await this.assertDiligenceAccess(id, user, 'read', 'view_diligences');
    return this.diligencesService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions('edit_diligence')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDiligenceDto,
    @CurrentUser() user: any,
  ) {
    await this.assertDiligenceAccess(id, user, 'write', 'edit_diligence');
    return this.diligencesService.update(id, dto, this.actorId(user));
  }

  @Delete(':id')
  @RequirePermissions('delete_diligence')
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
  ) {
    await this.assertDiligenceAccess(id, user, 'write', 'delete_diligence');
    return this.diligencesService.remove(id, this.actorId(user));
  }

  @Post(':id/start')
  @RequirePermissions('edit_diligence')
  async start(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
  ) {
    await this.assertDiligenceAccess(id, user, 'write', 'edit_diligence');
    return this.diligencesService.start(id, this.actorId(user));
  }

  @Post(':id/submit-review')
  @RequirePermissions('edit_diligence')
  async submitForReview(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
  ) {
    await this.assertDiligenceAccess(id, user, 'write', 'edit_diligence');
    return this.diligencesService.submitForReview(id, this.actorId(user));
  }

  @Post(':id/complete')
  @RequirePermissions('complete_diligence')
  async complete(
    @Param('id', ParseIntPipe) id: number,
    @Body('recommendations') recommendations: string | undefined,
    @CurrentUser() user: any,
  ) {
    await this.assertDiligenceAccess(
      id,
      user,
      'write',
      'complete_diligence',
    );
    return this.diligencesService.complete(
      id,
      recommendations,
      this.actorId(user),
    );
  }

  @Post(':id/cancel')
  @RequirePermissions('edit_diligence')
  async cancel(
    @Param('id', ParseIntPipe) id: number,
    @Body('reason') reason: string | undefined,
    @CurrentUser() user: any,
  ) {
    await this.assertDiligenceAccess(id, user, 'write', 'edit_diligence');
    return this.diligencesService.cancel(id, reason, this.actorId(user));
  }

  @Post(':id/generate-report')
  @RequirePermissions('generate_diligence_report')
  async generateReport(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
  ) {
    await this.assertDiligenceAccess(
      id,
      user,
      'write',
      'generate_diligence_report',
    );
    return this.diligencesService.generateReport(id, this.actorId(user));
  }

  @Post(':id/documents')
  @RequirePermissions('attach_document_to_diligence')
  async addDocuments(
    @Param('id', ParseIntPipe) id: number,
    @Body('documentIds') documentIds: number[],
    @CurrentUser() user: any,
  ) {
    await this.assertDiligenceAccess(
      id,
      user,
      'write',
      'attach_document_to_diligence',
    );
    return this.diligencesService.addDocumentsToDiligence(
      id,
      documentIds,
      this.actorId(user),
    );
  }

  private accessibleDossierIds(user: any): Promise<number[]> {
    return this.resourcePolicy.getAccessibleDossierIdsAtLevel(user, 1);
  }

  private actorId(user: any): number {
    return Number(user?.userId ?? user?.id);
  }

  private async assertDiligenceAccess(
    id: number,
    user: any,
    mode: 'read' | 'write',
    permission: string,
  ) {
    const scope = await this.diligencesService.getAccessScope(id);
    return this.resourcePolicy.assertDossierAccess(
      scope.dossierId,
      user,
      mode,
      permission,
      scope.confidentialityLevel,
    );
  }
}
