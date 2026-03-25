// src/modules/dossiers/dossiers.controller.ts
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/core/auth/guards/roles.guard';
import { CurrentUser } from 'src/core/decorators/current-user.decorator';
import { Roles } from 'src/core/decorators/roles.decorator';
import { UserRole } from 'src/core/enums/user-role.enum';
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
  Query,
  UseGuards,
  ParseIntPipe
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery, ApiParam } from '@nestjs/swagger';










import { User } from '../iam/user/entities/user.entity';
import { DossiersService } from './dossiers.service';
import { ChangeStatusDto } from './dto/change-status.dto';
import { CreateDossierDto } from './dto/create-dossier.dto';
import { DossierResponseDto } from './dto/dossier-response.dto';
import { DossierSearchDto } from './dto/dossier-search.dto';
import { UpdateDossierDto } from './dto/update-dossier.dto';
import { DossierStatsDto } from './dto/dossier-stats.dto';
import { DossierStatsService } from './dossier-stats.service';
import { ClientDecisionDto, JudgmentDto, PreliminaryAnalysisDto } from './dto/dossier-analysis.dto';
import { Step } from './entities/step.entity';











@ApiTags('dossiers')
@ApiBearerAuth()
@Controller('dossiers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DossiersController {
  constructor(private readonly dossiersService: DossiersService,
  private readonly statsService: DossierStatsService) {}

    @Get('stats')
  // @Roles(UserRole.ADMIN, UserRole.AVOCAT)
  @ApiOperation({ summary: 'Obtenir les statistiques des dossiers' })
  @ApiResponse({ status: 200, type: DossierStatsDto })
  @ApiQuery({ name: 'startDate', required: false, type: Date })
  @ApiQuery({ name: 'endDate', required: false, type: Date })
  @ApiQuery({ name: 'lawyerId', required: false, type: Number })
  @ApiQuery({ name: 'procedureTypeId', required: false, type: Number })
  @ApiQuery({ name: 'doosierId', required: false, type: Number })
  async getStats(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('lawyerId') lawyerId?: number,
    @Query('procedureTypeId') procedureTypeId?: number,
    @Query('doosierId') doosierId?: number,
  ): Promise<any> {
    return this.statsService.getStats({
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      lawyerId: lawyerId ? +lawyerId : undefined,
      procedureTypeId: procedureTypeId ? +procedureTypeId : undefined,
      doosierId: doosierId ? +doosierId : undefined,
      fieldToUseForDate : 'opening_date'
    });
  }

  @Get('stats/:id')
  // @Roles(UserRole.ADMIN, UserRole.AVOCAT)
  @ApiOperation({ summary: 'Obtenir les statistiques d\'un dossier spécifique' })
  @ApiParam({ name: 'id', description: 'ID du dossier' })
  async getStatsForDossier(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<any> {
    return this.statsService.getStats({ dossierId: id });
  }


  // @Get('summary')
  // @Roles(UserRole.ADMIN, UserRole.AVOCAT)
  // @ApiOperation({ summary: 'Obtenir un résumé des statistiques' })
  // async getSummary() {
  //   return this.statsService.getStats({});
  // }

  @Get('urgent')
  @Roles(UserRole.ADMIN, UserRole.AVOCAT)
  @ApiOperation({ summary: 'Obtenir les dossiers urgents' })
  async getUrgentDossiers() {
    const stats = await this.statsService.getStats({});
    return (stats as any).urgentDossiers;
  }


  @Post()
  // @Roles(UserRole.ADMIN, UserRole.AVOCAT, UserRole.SECRETAIRE)
  @ApiOperation({ summary: 'Créer un nouveau dossier' })
  @ApiResponse({ status: 201, description: 'Dossier créé avec succès', type: DossierResponseDto })
  @ApiResponse({ status: 400, description: 'Données invalides' })
  @ApiResponse({ status: 404, description: 'Client, avocat ou type de procédure non trouvé' })
  create(
    @Body() createDossierDto: CreateDossierDto,
    @CurrentUser() user: User
  )/*: Promise<DossierResponseDto | any>*/ {
    // return user;
    console.log(createDossierDto)
    return this.dossiersService.create(createDossierDto, user);
  }
  @Get('summary')
  // @Roles(UserRole.ADMIN, UserRole.AVOCAT)
  async getSummary() {
    // return this.dossiersService.getStats({});
  }

  @Get('search')
  @ApiOperation({ summary: 'Recherche texte avec relations' })
  @ApiResponse({ status: 200, description: 'Résultats de recherche', type: [DossierResponseDto]  })
  async search(

    @Query() searchParams?: DossierSearchDto,
    @Query() paginationParams?: PaginationParamsDto,
  ) {
    return this.dossiersService.searchWithTransformer(searchParams as SearchCriteria, DossierResponseDto , paginationParams);
  }

  @Get()
  @ApiOperation({ summary: 'Lister tous les dossiers (avec filtres)' })
  @ApiResponse({ status: 200, description: 'Liste des dossiers', type: [DossierResponseDto] })
  findAll(
    @Query() searchDto: DossierSearchDto,
    @CurrentUser() user: User
  ): Promise<any[]> {
    return this.dossiersService.findAll(searchDto, user);
  }

  @Get('paginated')
  @ApiOperation({ 
    summary: 'Lister les dossiers avec pagination',
    description: 'Retourne les dossiers avec des métadonnées de pagination'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Liste paginée des dossiers',
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: { $ref: '#/components/schemas/DossierResponseDto' }
        },
        meta: {
          type: 'object',
          properties: {
            page: { type: 'number', example: 1 },
            limit: { type: 'number', example: 10 },
            total: { type: 'number', example: 150 },
            total_pages: { type: 'number', example: 15 },
            has_previous: { type: 'boolean', example: false },
            has_next: { type: 'boolean', example: true }
          }
        }
      }
    }
  })
  async findAllPaginated(
    @Query() paginationParams: PaginationParamsDto,
    @Query() searchDto: DossierSearchDto,
    @CurrentUser() user: User
  ) {
    return this.dossiersService.findAllPaginated(paginationParams, searchDto, user);
  }

  @Get('statistics')
  @ApiOperation({ summary: 'Obtenir les statistiques des dossiers' })
  @ApiResponse({ status: 200, description: 'Statistiques des dossiers' })
  getStatistics(@CurrentUser() user: User): Promise<any> {
    return this.dossiersService.getStatistics(user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtenir un dossier par son ID' })
  @ApiResponse({ status: 200, description: 'Dossier trouvé', type: DossierResponseDto })
  @ApiResponse({ status: 404, description: 'Dossier non trouvé' })
  findOne(
    @Param('id', ParseIntPipe) id: string,
    @CurrentUser() user: User
  ): Promise<DossierResponseDto> {
    return this.dossiersService.findOne(+id, user);
  }

  @Patch(':id')
  // @Roles(UserRole.ADMIN, UserRole.AVOCAT, UserRole.SECRETAIRE)
  @ApiOperation({ summary: 'Mettre à jour un dossier' })
  @ApiResponse({ status: 200, description: 'Dossier mis à jour', type: DossierResponseDto })
  @ApiResponse({ status: 404, description: 'Dossier non trouvé' })
  update(
    @Param('id', ParseIntPipe) id: string,
    @Body() updateDossierDto: UpdateDossierDto,
    @CurrentUser() user: User
  ): Promise<DossierResponseDto | any> {
    console.log(updateDossierDto)
    return this.dossiersService.update(+id, updateDossierDto, user);
  }

  @Patch(':id/status')
  // @Roles(UserRole.ADMIN, UserRole.AVOCAT)
  @ApiOperation({ summary: 'Changer le statut d\'un dossier' })
  @ApiResponse({ status: 200, description: 'Statut mis à jour', type: DossierResponseDto })
  @ApiResponse({ status: 400, description: 'Transition de statut non autorisée' })
  changeStatus(
    @Param('id', ParseIntPipe) id: string,
    @Body() changeStatusDto: ChangeStatusDto,
    @CurrentUser() user: User
  ): Promise<DossierResponseDto> {
    return this.dossiersService.changeStatus(+id, changeStatusDto, user);
  }

  @Post(':id/archive')
  @Roles(UserRole.ADMIN, UserRole.AVOCAT)
  @ApiOperation({ summary: 'Archiver un dossier' })
  @ApiResponse({ status: 200, description: 'Dossier archivé', type: DossierResponseDto })
  @ApiResponse({ status: 400, description: 'Impossible d\'archiver le dossier' })
  archive(
    @Param('id', ParseIntPipe) id: string,
    @CurrentUser() user: User
  ): Promise<DossierResponseDto> {
    return this.dossiersService.archive(+id, user);
  }

  @Delete(':id')
  // @Roles(UserRole.ADMIN, UserRole.AVOCAT)
  @ApiOperation({ summary: 'Supprimer un dossier' })
  @ApiResponse({ status: 200, description: 'Dossier supprimé' })
  @ApiResponse({ status: 400, description: 'Impossible de supprimer le dossier' })
  remove(
    @Param('id', ParseIntPipe) id: string,
    @CurrentUser() user: User
  ): Promise<void> {
    return this.dossiersService.remove(+id, user);
  }

  @Get('collaborator/:collaboratorId')
  async getDossiersByCollaborator(
    @Param('collaboratorId') collaboratorId: number,
    @Query() paginationParams: PaginationParamsDto
  ) {
    return this.dossiersService.getCollaboratorDossiers(collaboratorId, paginationParams);
  }

  // Endpoints spécifiques pour les relations
  @Get(':id/documents')
  @ApiOperation({ summary: 'Obtenir les documents d\'un dossier' })
  getDocuments(@Param('id', ParseIntPipe) id: string, @CurrentUser() user: User) {
    // Implémentation dans le service Documents
    return this.dossiersService.findOne(+id, user).then(dossier => dossier.documents);
  }

  @Get(':id/audiences')
  @ApiOperation({ summary: 'Obtenir les audiences d\'un dossier' })
  getAudiences(@Param('id', ParseIntPipe) id: string, @CurrentUser() user: User) {
    // Implémentation dans le service Audiences
    return this.dossiersService.findOne(+id, user).then(dossier => dossier.audiences);
  }

  @Get(':id/factures')
  @ApiOperation({ summary: 'Obtenir les factures d\'un dossier' })
  getFactures(@Param('id', ParseIntPipe) id: string, @CurrentUser() user: User) {
    // Implémentation dans le service Finances
    return this.dossiersService.findOne(+id, user).then(dossier => dossier.factures);
  }



   @Post(':id/analysis')
    @Roles(UserRole.AVOCAT, UserRole.ADMIN)
    async performAnalysis(
      @Param('id') id: string,
      @Body() dto: PreliminaryAnalysisDto,
      @CurrentUser() user: User
    ) {
      return this.dossiersService.performPreliminaryAnalysis(
        +id,
        dto.successProbability,
        dto.danger_level,
        dto.notes,
        user
      );
    }
  
    @Post(':id/client-decision')
    @Roles(UserRole.AVOCAT, UserRole.ADMIN)
    async clientDecision(
      @Param('id') id: string,
      @Body() dto: ClientDecisionDto,
      @CurrentUser() user: User
    ) {
      return this.dossiersService.processClientDecision(+id, dto.decision as any, user);
    }
  
    @Post(':id/judgment')
    @Roles(UserRole.AVOCAT, UserRole.ADMIN)
    async registerJudgment(
      @Param('id') id: string,
      @Body() dto: JudgmentDto,
      @CurrentUser() user: User
    ) {
      return this.dossiersService.registerJudgment(+id, dto.decision, dto.isSatisfied, user);
    }  

    @Post(':id/register/apeal/decision')
    @Roles(UserRole.AVOCAT, UserRole.ADMIN)
    async registerAppealDecision(
      @Param('id') id: string,
      @Body() dto: JudgmentDto,
      @CurrentUser() user: User
    ) {
      // return dto
      return this.dossiersService.registerAppealDecision(+id, dto.decision, dto.isSatisfied, user);
    }

    @Post(':id/register/cassation/decision')
    @Roles(UserRole.AVOCAT, UserRole.ADMIN)
    async registerCassationDecision(
      @Param('id') id: string,
      @Body() dto: JudgmentDto,
      @CurrentUser() user: User
    ) {
      return this.dossiersService.registerCassationDecision(+id, dto.decision as any, dto.isSatisfied, user);
    }
  
    @Post(':id/appeal')
    @Roles(UserRole.AVOCAT, UserRole.ADMIN)
    async fileAppeal(
      @Param('id') id: string,
      @CurrentUser() user: User
    ) {
      return this.dossiersService.fileAppeal(+id, user);
    }
  
    @Post(':id/cassation')
    @Roles(UserRole.AVOCAT, UserRole.ADMIN)
    async fileCassation(
      @Param('id') id: string,
      @CurrentUser() user: User
    ) {
      return this.dossiersService.fileCassation(+id, user);
    }
  
    @Post(':id/execute')
    @Roles(UserRole.AVOCAT, UserRole.ADMIN)
    async executeDecision(
      @Param('id') id: string,
      @CurrentUser() user: User
    ) {
      return this.dossiersService.executeDecision(+id, user);
    }
  
    @Post(':id/close')
    @Roles(UserRole.AVOCAT, UserRole.ADMIN)
    async closeDossier(
      @Param('id') id: string,
      @CurrentUser() user: User
    ) {
      return this.dossiersService.closeDossier(+id, user);
    }


      @Get(':dossierId/steps/current')
  @ApiOperation({ 
    summary: 'Obtenir l\'étape courante',
    description: 'Retourne l\'étape actuellement en cours pour le dossier'
  })
  @ApiParam({
    name: 'dossierId',
    description: 'ID du dossier',
    type: Number,
    example: 1
  })
  @ApiResponse({
    status: 200,
    description: 'Étape courante récupérée avec succès',
    type: Step
  })
  @ApiResponse({
    status: 404,
    description: 'Dossier non trouvé ou aucune étape en cours'
  })
  async getCurrentStep(@Param('dossierId', ParseIntPipe) dossierId: number) {
    return this.dossiersService.getCurrentStep(dossierId);
  }

  @Get(':dossierId/steps/workflow')
  @ApiOperation({ 
    summary: 'Obtenir le workflow complet du dossier',
    description: 'Retourne toutes les étapes du dossier dans l\'ordre chronologique'
  })
  @ApiParam({
    name: 'dossierId',
    description: 'ID du dossier',
    type: Number,
    example: 1
  })
  @ApiResponse({
    status: 200,
    description: 'Workflow récupéré avec succès',
    type: [Step]
  })
  @ApiResponse({
    status: 404,
    description: 'Dossier non trouvé'
  })
  async getWorkflow(@Param('dossierId', ParseIntPipe) dossierId: number) {
    return this.dossiersService.getDossierWorkflow(dossierId);
  }



}