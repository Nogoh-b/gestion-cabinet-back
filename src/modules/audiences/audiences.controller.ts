import { PaginationParamsDto } from 'src/core/shared/dto/pagination-params.dto';
import { SearchCriteria } from 'src/core/shared/services/search/base-v1.service';
import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query
  ,UseGuards
  ,ForbiddenException
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AudiencesService } from './audiences.service';
import { CreateAudienceDto } from './dto/create-audience.dto';
import { AudienceListResponseDto, AudienceResponseDto } from './dto/response-audience.dto';
import { AudienceSearchDto } from './dto/search-audience.dto';
import { UpdateAudienceDto } from './dto/update-audience.dto';
import { AudienceStatsService } from './audience-stats.service';
import { AudienceDecisionService } from './audience-decision.service';
import { AddDecisionResponseDto, DecisionAudienceDto } from './dto/decision-audience.dto';
import { RolesGuard } from 'src/core/auth/guards/roles.guard';
import { PermissionsGuard } from 'src/core/common/guards/permissions.guard';
import { RequirePermissions } from 'src/core/decorators/permissions.decorator';
import { CurrentUser } from 'src/core/decorators/current-user.decorator';
import {
  ResourceActor,
  ResourcePolicyService,
} from 'src/core/resource-policy.service';

@ApiTags('Audiences')
@ApiBearerAuth()
@Controller('audiences')
@UseGuards(RolesGuard, PermissionsGuard)
export class AudiencesController {
  constructor(
    private readonly audiencesService: AudiencesService,
    private readonly decisionService: AudienceDecisionService, // Ajouter ceci
    private readonly statsService: AudienceStatsService,
    private readonly resourcePolicy: ResourcePolicyService,
    ) {}

  private actor(user: any): ResourceActor {
    return {
      id: Number(user?.id),
      userId: Number(user?.userId ?? user?.id),
      tenantId: Number(
        user?.tenantId ?? user?.tenant_id ?? user?.cabinetId ?? user?.cabinet_id,
      ),
      role: user?.role,
      permissions: Array.isArray(user?.permissions) ? user.permissions : [],
      customerId: user?.customerId ?? user?.customer_id ?? null,
    };
  }

  private async assertAudienceAccess(
    id: number,
    user: any,
    mode: 'read' | 'write' | 'override',
    permission: string,
  ): Promise<void> {
    const dossierId = await this.audiencesService.getAudienceDossierId(id);
    await this.resourcePolicy.assertDossierAccess(
      dossierId,
      this.actor(user),
      mode,
      permission,
    );
  }

  // ✅ CREATE - POST /audiences
  @Post()
  @RequirePermissions('create_audience')
  @ApiOperation({ summary: 'Créer une audience' })
  @ApiResponse({ status: 201, type: AudienceResponseDto })
  async create(
    @Body() createAudienceDto: CreateAudienceDto,
    @CurrentUser() user: any,
  ) {
    return this.audiencesService.create(createAudienceDto, this.actor(user));
  }

    @Get('stats')
    @RequirePermissions('view_audiences')
    @ApiQuery({ name: 'startDate', required: false, type: Date })
    @ApiQuery({ name: 'endDate', required: false, type: Date })
  // @Roles(UserRole.ADMIN, UserRole.AVOCAT)
  async getSummary(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @CurrentUser() user?: any,
  ) {
    const actor = this.actor(user);
    if (
      actor.role !== 'admin' &&
      !actor.permissions?.includes('SUPER_ADMIN')
    ) {
      throw new ForbiddenException(
        'Les statistiques globales exigent un rôle administrateur',
      );
    }
    return this.statsService.getStats({
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      fieldToUseForDate : 'starts_at_utc'
    });
  }

  // ✅ SEARCH - GET /audiences/search
  @Get('/search')
  @RequirePermissions('view_audiences')
  @ApiOperation({ summary: 'Rechercher des audiences avec filtres' })
  @ApiResponse({ status: 200, type: [AudienceListResponseDto] })
  async search(
    @Query() searchParams?: AudienceSearchDto,
    @Query() paginationParams?: PaginationParamsDto,
    @CurrentUser() user?: any,
  ) {
    const result: any = await this.audiencesService.searchWithTransformer(
      searchParams as SearchCriteria,
      AudienceResponseDto,
      paginationParams,
    );
    const accessible = new Set(
      await this.resourcePolicy.getAccessibleDossierIds(this.actor(user)),
    );
    if (Array.isArray(result)) {
      return result.filter((audience) =>
        accessible.has(Number(audience.dossier_id ?? audience.dossier?.id)),
      );
    }
    if (Array.isArray(result?.data)) {
      result.data = result.data.filter((audience) =>
        accessible.has(Number(audience.dossier_id ?? audience.dossier?.id)),
      );
      if (result.meta) {
        result.meta.total = result.data.length;
        result.meta.total_pages = result.data.length ? 1 : 0;
      }
    }
    return result;
  }

  // ✅ LIST - GET /audiences
  @Get()
  @RequirePermissions('view_audiences')
  @ApiOperation({ summary: 'Lister toutes les audiences' })
  @ApiResponse({ status: 200, type: [AudienceListResponseDto] })
  async findAll(@CurrentUser() user: any) {
    const accessible = new Set(
      await this.resourcePolicy.getAccessibleDossierIds(this.actor(user)),
    );
    return (await this.audiencesService.findAll()).filter((audience) =>
      accessible.has(Number(audience.dossier_id)),
    );
  }

  // ✅ GET BY ID - GET /audiences/:id
  @Get(':id')
  @RequirePermissions('view_audiences')
  @ApiOperation({ summary: 'Obtenir une audience par ID' })
  @ApiResponse({ status: 200, type: AudienceResponseDto })
  async findOne(@Param('id') id: string, @CurrentUser() user: any) {
    await this.assertAudienceAccess(+id, user, 'read', 'view_audiences');
    return await this.audiencesService.findOne(+id);
  }

  // ✅ UPDATE - PATCH /audiences/:id
  @Patch(':id')
  @RequirePermissions('edit_audience')
  @ApiOperation({ summary: 'Mettre à jour une audience' })
  @ApiResponse({ status: 200, type: AudienceResponseDto })
  async update(@Param('id') id: string, @Body() updateAudienceDto: UpdateAudienceDto, @CurrentUser() user: any) {
    await this.assertAudienceAccess(+id, user, 'write', 'edit_audience');
    return await this.audiencesService.update(
      +id,
      updateAudienceDto,
      this.actor(user),
    );
  }

  // ✅ DELETE - DELETE /audiences/:id
  @Delete(':id')
  @RequirePermissions('delete_audience')
  @ApiOperation({ summary: 'Supprimer une audience' })
  @ApiResponse({ status: 200, description: 'Audience supprimée avec succès' })
  async remove(@Param('id') id: string, @CurrentUser() user: any) {
    await this.assertAudienceAccess(+id, user, 'write', 'delete_audience');
    return await this.audiencesService.remove(+id);
  }


  /**
   * ✅ AJOUTER UNE DÉCISION - POST /audiences/:id/decision
   */
  @Post(':id/decision')
  @RequirePermissions('confirm_audience')
  @ApiOperation({ summary: 'Ajouter une décision à une audience' })
  @ApiResponse({ status: 201, type: AddDecisionResponseDto })
  async addDecision(
    @Param('id') id: string,
    @Body() decisionDto: DecisionAudienceDto,
    @CurrentUser() user: any,
  ) {
    await this.assertAudienceAccess(+id, user, 'write', 'confirm_audience');
    await this.decisionService.addDecision(
      +id,
      decisionDto,
      this.actor(user),
    );
    return await this.audiencesService.findOneV1(+id)
  }

  /**
   * reprogramer audience
   */
  @Post(':id/postpone/to')
  @RequirePermissions('postpone_audience')
  @ApiOperation({ summary: 'Ajouter une décision à une audience' })
  @ApiResponse({ status: 201, type: AddDecisionResponseDto })
  async postpone(
    @Param('id') id: string,
    @Body() updateDto: UpdateAudienceDto,
    @CurrentUser() user: any,
  ) {
    await this.assertAudienceAccess(+id, user, 'write', 'postpone_audience');
    const audience =  await this.audiencesService.postpone(+id, updateDto, this.actor(user));
    return audience
  }

  /**
   * ✅ MODIFIER UNE DÉCISION - PATCH /audiences/:id/decision
   */
  @Patch(':id/decision')
  @RequirePermissions('confirm_audience')
  @ApiOperation({ summary: 'Modifier la décision d\'une audience' })
  @ApiResponse({ status: 200, type: AddDecisionResponseDto })
  async updateDecision(
    @Param('id') id: string,
    @Body() decisionDto: DecisionAudienceDto,
    @CurrentUser() user: any,
  ) {
    await this.assertAudienceAccess(+id, user, 'write', 'confirm_audience');
    await this.decisionService.updateDecision(
      +id,
      decisionDto,
      this.actor(user),
    );
        return await this.audiencesService.findOneV1(+id)
  }

  @Post(':id/decision/validate')
  @RequirePermissions('confirm_audience')
  @ApiOperation({ summary: 'Valider la décision d’une audience' })
  async validateDecision(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ) {
    await this.assertAudienceAccess(+id, user, 'write', 'confirm_audience');
    return this.decisionService.validateDecision(+id, this.actor(user));
  }

  @Post(':id/decision/seal')
  @RequirePermissions('confirm_audience')
  @ApiOperation({ summary: 'Sceller la décision validée d’une audience' })
  async sealDecision(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ) {
    await this.assertAudienceAccess(+id, user, 'write', 'confirm_audience');
    return this.decisionService.sealDecision(+id, this.actor(user));
  }

  /**
   * ✅ RÉCUPÉRER LA DÉCISION - GET /audiences/:id/decision
   */
  @Get(':id/decision')
  @RequirePermissions('view_audiences')
  @ApiOperation({ summary: 'Récupérer la décision d\'une audience' })
  async getDecision(@Param('id') id: string, @CurrentUser() user: any) {
    await this.assertAudienceAccess(+id, user, 'read', 'view_audiences');
    return await this.decisionService.getDecision(+id);
    
  }

  /**
   * ✅ SUPPRIMER UN DOCUMENT DE LA DÉCISION - DELETE /audiences/:id/decision/documents/:documentId
   */
  @Delete(':id/decision/documents/:documentId')
  @RequirePermissions('confirm_audience')
  @ApiOperation({ summary: 'Supprimer un document de la décision' })
  async removeDecisionDocument(
    @Param('id') id: string,
    @Param('documentId') documentId: string,
    @CurrentUser() user: any,
  ) {
    await this.assertAudienceAccess(+id, user, 'write', 'confirm_audience');
    return await this.decisionService.removeDecisionDocument(
      +id,
      +documentId,
      this.actor(user),
    );
  }

  // ── Rapport d'audience (procès-verbal) ────────────────────────────────────
  @Post(':id/report')
  @RequirePermissions('edit_audience')
  @ApiOperation({ summary: 'Ajouter un rapport d\'audience' })
  async addReport(
    @Param('id') id: string,
    @Body() payload: {
      report_content: string;
      report_date?: Date;
      report_author_id?: string;
      document_ids?: number[];
      amendment_reason?: string;
    },
    @CurrentUser() user: any,
  ) {
    await this.assertAudienceAccess(+id, user, 'write', 'edit_audience');
    return await this.audiencesService.addReport(
      +id,
      payload,
      this.actor(user),
    );
  }

  @Patch(':id/report')
  @RequirePermissions('edit_audience')
  @ApiOperation({ summary: 'Mettre à jour le rapport d\'audience' })
  async updateReport(
    @Param('id') id: string,
    @Body() payload: {
      report_content?: string;
      report_date?: Date;
      report_author_id?: string;
      document_ids?: number[];
      amendment_reason?: string;
    },
    @CurrentUser() user: any,
  ) {
    await this.assertAudienceAccess(+id, user, 'write', 'edit_audience');
    return await this.audiencesService.updateReport(
      +id,
      payload,
      this.actor(user),
    );
  }

  @Post(':id/report/validate')
  @RequirePermissions('edit_audience')
  @ApiOperation({ summary: 'Valider le rapport d’audience' })
  async validateReport(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ) {
    await this.assertAudienceAccess(+id, user, 'write', 'edit_audience');
    return this.audiencesService.validateReport(+id, this.actor(user));
  }

  @Post(':id/report/seal')
  @RequirePermissions('confirm_audience')
  @ApiOperation({ summary: 'Sceller le rapport validé d’audience' })
  async sealReport(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ) {
    await this.assertAudienceAccess(+id, user, 'write', 'confirm_audience');
    return this.audiencesService.sealReport(+id, this.actor(user));
  }

  @Post(':id/held')
  @RequirePermissions('mark_audience_held')
  @ApiOperation({ summary: 'Marquer une audience comme tenue' })
  async markAsHeld(
    @Param('id') id: string,
    @Body() payload: { notes?: string },
    @CurrentUser() user: any,
  ) {
    await this.assertAudienceAccess(
      +id,
      user,
      'write',
      'mark_audience_held',
    );
    return this.audiencesService.markAsHeld(
      +id,
      payload?.notes,
      this.actor(user),
    );
  }

  @Post(':id/cancel')
  @RequirePermissions('cancel_audience')
  @ApiOperation({ summary: 'Annuler une audience avec justification' })
  async cancel(
    @Param('id') id: string,
    @Body() payload: { reason: string },
    @CurrentUser() user: any,
  ) {
    await this.assertAudienceAccess(+id, user, 'write', 'cancel_audience');
    return this.audiencesService.cancel(
      +id,
      payload?.reason,
      this.actor(user),
    );
  }

  @Get(':id/report')
  @RequirePermissions('view_audiences')
  @ApiOperation({ summary: 'Récupérer le rapport d\'audience' })
  async getReport(@Param('id') id: string, @CurrentUser() user: any) {
    await this.assertAudienceAccess(+id, user, 'read', 'view_audiences');
    return await this.audiencesService.getReport(+id);
  }
}
