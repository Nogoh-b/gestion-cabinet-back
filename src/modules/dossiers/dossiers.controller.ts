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
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';

import { User } from '../iam/user/entities/user.entity';
import { DossiersService } from './dossiers.service';
import { ChangeStatusDto } from './dto/change-status.dto';
import { CreateDossierDto } from './dto/create-dossier.dto';
import { DossierResponseDto } from './dto/dossier-response.dto';
import { DossierSearchDto } from './dto/dossier-search.dto';
import { UpdateDossierDto } from './dto/update-dossier.dto';


@ApiTags('dossiers')
@ApiBearerAuth()
@Controller('dossiers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DossiersController {
  constructor(private readonly dossiersService: DossiersService) {}

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
  @Roles(UserRole.ADMIN, UserRole.AVOCAT, UserRole.SECRETAIRE)
  @ApiOperation({ summary: 'Mettre à jour un dossier' })
  @ApiResponse({ status: 200, description: 'Dossier mis à jour', type: DossierResponseDto })
  @ApiResponse({ status: 404, description: 'Dossier non trouvé' })
  update(
    @Param('id', ParseIntPipe) id: string,
    @Body() updateDossierDto: UpdateDossierDto,
    @CurrentUser() user: User
  ): Promise<DossierResponseDto> {
    return this.dossiersService.update(+id, updateDossierDto, user);
  }

  @Patch(':id/status')
  @Roles(UserRole.ADMIN, UserRole.AVOCAT)
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
  @Roles(UserRole.ADMIN, UserRole.AVOCAT)
  @ApiOperation({ summary: 'Supprimer un dossier' })
  @ApiResponse({ status: 200, description: 'Dossier supprimé' })
  @ApiResponse({ status: 400, description: 'Impossible de supprimer le dossier' })
  remove(
    @Param('id', ParseIntPipe) id: string,
    @CurrentUser() user: User
  ): Promise<void> {
    return this.dossiersService.remove(+id, user);
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
}