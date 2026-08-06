// src/modules/dossiers/dossiers.controller.ts
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/core/auth/guards/roles.guard';
import { PermissionsGuard } from 'src/core/common/guards/permissions.guard';
import { CurrentUser } from 'src/core/decorators/current-user.decorator';
import { RequirePermissions } from 'src/core/decorators/permissions.decorator';
import { Roles } from 'src/core/decorators/roles.decorator';
import { UserRole } from 'src/core/enums/user-role.enum';
import { PaginationParamsDto } from 'src/core/shared/dto/pagination-params.dto';
import { SearchCriteria } from 'src/core/shared/services/search/base-v1.service';
import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  ParseIntPipe,
  UseInterceptors,
  UploadedFile,
  Request
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';










import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery, ApiParam, ApiBody, ApiConsumes } from '@nestjs/swagger';



import { User } from '../iam/user/entities/user.entity';
import { DossierStatsService } from './dossier-stats.service';
import { DossiersService } from './dossiers.service';
import { CloseDossierDto } from './dto/close-dossier.dto';
import { CreateDossierDto, UploadDocumentToSubStageDto } from './dto/create-dossier.dto';
import { DossierResponseDto } from './dto/dossier-response.dto';
import { DossierSearchDto } from './dto/dossier-search.dto';
import { DossierStatsDto } from './dto/dossier-stats.dto';
import { UpdateDossierDto } from './dto/update-dossier.dto';














@ApiTags('dossiers')
@ApiBearerAuth()
@Controller('dossiers')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class DossiersController {
  constructor(private readonly dossiersService: DossiersService,
  private readonly statsService: DossierStatsService) {}

    @Get('stats')
  // @Roles(UserRole.ADMIN, UserRole.AVOCAT)
  @RequirePermissions('view_dossiers')
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
  @RequirePermissions('view_dossiers')
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
  @RequirePermissions('view_dossiers')
  @ApiOperation({ summary: 'Obtenir les dossiers urgents' })
  async getUrgentDossiers() {
    const stats = await this.statsService.getStats({});
    return (stats as any).urgentDossiers;
  }


  @Post()
  // @Roles(UserRole.ADMIN, UserRole.AVOCAT, UserRole.SECRETAIRE)
  @RequirePermissions('create_dossier')
  @ApiOperation({ summary: 'Créer un nouveau dossier' })
  @ApiResponse({ status: 201, description: 'Dossier créé avec succès', type: DossierResponseDto })
  @ApiResponse({ status: 400, description: 'Données invalides' })
  @ApiResponse({ status: 404, description: 'Client, avocat ou type de procédure non trouvé' })
  create(
    @Body() createDossierDto: CreateDossierDto,
    @CurrentUser() user: User
  )/*: Promise<DossierResponseDto | any>*/ {
    // return user;
    return this.dossiersService.create(createDossierDto, user);
  }
  @Get('summary')
  // @Roles(UserRole.ADMIN, UserRole.AVOCAT)
  @RequirePermissions('view_dossiers')
  async getSummary() {
    // return this.dossiersService.getStats({});
  }

  @Get('search')
  @RequirePermissions('view_dossiers')
  @ApiOperation({ summary: 'Recherche texte avec relations' })
  @ApiResponse({ status: 200, description: 'Résultats de recherche', type: [DossierResponseDto]  })
  async search(

    @Query() searchParams?: DossierSearchDto,
    @Query() paginationParams?: PaginationParamsDto,
  ) {
    return this.dossiersService.searchWithTransformer(searchParams as SearchCriteria, DossierResponseDto , paginationParams);
  }

  @Get()
  @RequirePermissions('view_dossiers')
  @ApiOperation({ summary: 'Lister tous les dossiers (avec filtres)' })
  @ApiResponse({ status: 200, description: 'Liste des dossiers', type: [DossierResponseDto] })
  findAll(
    @Query() searchDto: DossierSearchDto,
    @CurrentUser() user: User
  ): Promise<any[]> {
    return this.dossiersService.findAll(searchDto, user);
  }

  @Get('paginated')
  @RequirePermissions('view_dossiers')
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
  @RequirePermissions('view_dossiers')
  @ApiOperation({ summary: 'Obtenir les statistiques des dossiers' })
  @ApiResponse({ status: 200, description: 'Statistiques des dossiers' })
  getStatistics(@CurrentUser() user: User): Promise<any> {
    return this.dossiersService.getStatistics(user);
  }

  @Get(':id')
  @RequirePermissions('view_dossiers')
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
  @RequirePermissions('edit_dossier')
  @ApiOperation({ summary: 'Mettre à jour un dossier' })
  @ApiResponse({ status: 200, description: 'Dossier mis à jour', type: DossierResponseDto })
  @ApiResponse({ status: 404, description: 'Dossier non trouvé' })
  update(
    @Param('id', ParseIntPipe) id: string,
    @Body() updateDossierDto: UpdateDossierDto,
    @CurrentUser() user: User
  ): Promise<DossierResponseDto | any> {
    return this.dossiersService.update(+id, updateDossierDto, user);
  }

  @Post(':id/archive')
  @Roles(UserRole.ADMIN, UserRole.AVOCAT)
  @RequirePermissions('edit_dossier')
  @ApiOperation({ summary: 'Archiver un dossier' })
  @ApiResponse({ status: 200, description: 'Dossier archivé', type: DossierResponseDto })
  @ApiResponse({ status: 400, description: 'Impossible d\'archiver le dossier' })
  archive(
    @Param('id', ParseIntPipe) id: string,
    @CurrentUser() user: User
  ): Promise<DossierResponseDto> {
    return this.dossiersService.archive(+id, user);
  }

  @Post(':id/activate')
  @RequirePermissions('edit_dossier')
  @ApiOperation({ summary: 'Activer un dossier et créer son instance procédurale' })
  activate(
    @Param('id', ParseIntPipe) id: string,
    @CurrentUser() user: User,
  ): Promise<DossierResponseDto> {
    return this.dossiersService.activate(+id, user);
  }

  @Post(':id/reopen')
  @RequirePermissions('edit_dossier')
  @ApiOperation({ summary: 'Rouvrir administrativement un dossier clôturé' })
  reopen(
    @Param('id', ParseIntPipe) id: string,
    @CurrentUser() user: User,
  ): Promise<DossierResponseDto> {
    return this.dossiersService.reopen(+id, user);
  }
  

  @Delete(':id')
  // @Roles(UserRole.ADMIN, UserRole.AVOCAT)
  @RequirePermissions('delete_dossier')
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
  @RequirePermissions('view_dossiers')
  async getDossiersByCollaborator(
    @Param('collaboratorId') collaboratorId: number,
    @Query() paginationParams: PaginationParamsDto
  ) {
    return this.dossiersService.getCollaboratorDossiers(collaboratorId, paginationParams);
  }

  // Endpoints spécifiques pour les relations
  @Get(':id/documents')
  @RequirePermissions('view_dossiers')
  @ApiOperation({ summary: 'Obtenir les documents d\'un dossier' })
  getDocuments(@Param('id', ParseIntPipe) id: string, @CurrentUser() user: User) {
    // Implémentation dans le service Documents
    return this.dossiersService.findOne(+id, user).then(dossier => dossier.documents);
  }

  @Get(':id/audiences')
  @RequirePermissions('view_dossiers')
  @ApiOperation({ summary: 'Obtenir les audiences d\'un dossier' })
  getAudiences(@Param('id', ParseIntPipe) id: string, @CurrentUser() user: User) {
    // Implémentation dans le service Audiences
    return this.dossiersService.findOne(+id, user).then(dossier => dossier.audiences);
  }

  @Get(':id/factures')
  @RequirePermissions('view_dossiers')
  @ApiOperation({ summary: 'Obtenir les factures d\'un dossier' })
  getFactures(@Param('id', ParseIntPipe) id: string, @CurrentUser() user: User) {
    // Implémentation dans le service Finances
    return this.dossiersService.findOne(+id, user).then(dossier => dossier.factures);
  }


    /**
   * Lier des documents existants à une sous-étape de procédure
   */
  @ApiOperation({ summary: 'Lier des documents à une sous-étape de procédure' })
  @ApiResponse({ status: 200, description: 'Documents liés avec succès' })
  @ApiResponse({ status: 404, description: 'Sous-étape ou dossier non trouvé' })

  /**
   * Ajouter un collaborateur (Employee) à un dossier.
   */
  @Post(':id/collaborators')
  @RequirePermissions('edit_dossier')
  @ApiOperation({ summary: 'Ajouter un collaborateur au dossier' })
  @ApiResponse({ status: 201, description: 'Collaborateur ajouté avec succès', type: DossierResponseDto })
  @ApiResponse({ status: 404, description: 'Dossier ou collaborateur non trouvé' })
  @ApiParam({ name: 'id', description: 'ID du dossier' })
  async addCollaborator(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { employee_id: number },
    @CurrentUser() user: User,
  ) {
    return this.dossiersService.addCollaborator(id, body?.employee_id, user);
  }

  /**
   * Retirer un collaborateur (Employee) d'un dossier.
   */
  @Delete(':id/collaborators/:employeeId')
  @RequirePermissions('edit_dossier')
  @ApiOperation({ summary: 'Retirer un collaborateur du dossier' })
  @ApiResponse({ status: 200, description: 'Collaborateur retiré avec succès', type: DossierResponseDto })
  @ApiParam({ name: 'id', description: 'ID du dossier' })
  @ApiParam({ name: 'employeeId', description: 'ID du collaborateur à retirer' })
  async removeCollaborator(
    @Param('id', ParseIntPipe) id: number,
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @CurrentUser() user: User,
  ) {
    return this.dossiersService.removeCollaborator(id, employeeId, user);
  }

  /**
   * Synchroniser la liste des collaborateurs du dossier (remplace toute la liste).
   */
  @Put(':id/collaborators')
  @RequirePermissions('edit_dossier')
  @ApiOperation({ summary: 'Synchroniser les collaborateurs du dossier' })
  @ApiResponse({ status: 200, description: 'Collaborateurs synchronisés', type: DossierResponseDto })
  @ApiParam({ name: 'id', description: 'ID du dossier' })
  async syncCollaborators(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { employee_ids: number[] },
    @CurrentUser() user: User,
  ) {
    return this.dossiersService.syncCollaborators(id, body?.employee_ids ?? [], user);
  }

      // Gérer les fichiers uploadés
        // Uploader les fichiers et récupérer leurs IDs
        // fileIds = await this.uploadService.uploadFiles(files);


  // Dans dossiers.controller.ts
  @Post(':id/close')
  @Roles(UserRole.AVOCAT, UserRole.ADMIN)
  @RequirePermissions('edit_dossier')
  async closeDossier(
    @Param('id') id: string,
    @Body() closeDto: CloseDossierDto,
    @CurrentUser() user: User
  ) {
    return this.dossiersService.closeDossier(+id, user, closeDto);
  }

  @Get(':dossierId/stage-visits')
  @RequirePermissions('view_dossiers')
  @ApiOperation({
    summary: 'Obtenir l\'historique des visites de stage',
    description: 'Retourne l\'historique complet des visites de stage pour un dossier donné, avec les sous-étapes, documents, diligences, audiences et factures associés à chaque visite.'
  })
  @ApiParam({ name: 'dossierId', description: 'ID du dossier', type: Number, example: 1 })
  async getStageVisits(@Param('dossierId', ParseIntPipe) dossierId: number) {
    return this.dossiersService.getStageVisits(dossierId);
  }

  /**
   * Liste simplifiée des StageVisit d'un dossier — pour les selects de formulaires.
   * Retourne { data: [{ id, label, visitNumber, stageName, enteredAt, isActive, badge }] }
   */
  @Get(':dossierId/stage-visits/select')
  @RequirePermissions('view_dossiers')
  @ApiOperation({ summary: 'Liste des visites d\'étape pour select (formulaires)' })
  @ApiParam({ name: 'dossierId', description: 'ID du dossier', type: Number })
  async getStageVisitsSelect(@Param('dossierId', ParseIntPipe) dossierId: number) {
    return this.dossiersService.getStageVisitsForSelect(dossierId);
  }

  /**
   * Liste simplifiée des SubStageVisit d'une StageVisit — pour les selects de formulaires.
   * Retourne { data: [{ id, label, subStageName, isCompleted, startedAt, badge }] }
   */
  @Get(':dossierId/stage-visits/:stageVisitId/sub-stage-visits')
  @RequirePermissions('view_dossiers')
  @ApiOperation({ summary: 'Liste des visites de sous-étape pour select (formulaires)' })
  @ApiParam({ name: 'dossierId', description: 'ID du dossier', type: Number })
  @ApiParam({ name: 'stageVisitId', description: 'ID UUID de la visite d\'étape', type: String })
  async getSubStageVisitsSelect(
    @Param('dossierId', ParseIntPipe) dossierId: number,
    @Param('stageVisitId') stageVisitId: string,
  ) {
    return this.dossiersService.getSubStageVisitsForSelect(dossierId, stageVisitId);
  }




  /**
   * Uploader un document et le lier directement à une visite de sous-étape de procédure.
   *
   * - dossier_id est résolu depuis le paramètre d'URL :id
   * - customer_id est résolu depuis le client du dossier
   * - sub_stage_visit_id / stage_visit_id sont optionnels : si fournis, le document
   *   est ajouté à la table de jointure sub_stage_visit_documents / stage_visit_documents
   */
  @Post(':id/documents/upload')
  @RequirePermissions('upload_document')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({
    summary: 'Uploader un document lié à une sous-étape de procédure',
    description: 'Crée un document et le lie automatiquement à la visite de sous-étape spécifiée (ou courante)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 201, description: 'Document créé et lié avec succès' })
  @ApiResponse({ status: 404, description: 'Dossier ou type de document introuvable' })
  async uploadDocumentToSubStage(
    @Param('id', ParseIntPipe) dossierId: number,
    @Body() dto: UploadDocumentToSubStageDto,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: User,
  ) {
    return this.dossiersService.uploadDocumentToSubStage(dossierId, dto, file, user);
  }





}
