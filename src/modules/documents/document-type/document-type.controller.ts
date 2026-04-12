// src/core/document/document-type.controller.ts
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/core/common/guards/permissions.guard';
import { RequirePermissions } from 'src/core/decorators/permissions.decorator';
import { PaginationParamsDto } from 'src/core/shared/dto/pagination-params.dto';
import { SearchCriteria } from 'src/core/shared/services/search/base-v1.service';
import { Any } from 'typeorm';
import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  Put,
  Delete,
  UseGuards,
  Query,
  ParseIntPipe,
} from '@nestjs/common';






import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';

import { DocumentTypeService } from './document-type.service';
import { CreateDocumentTypeDto } from './dto/create-document-type.dto';
import { DocumentTypeResponseDto } from './dto/ressponse-document-type.dto';
import { UpdateDocumentTypeDto } from './dto/update-document-type.dto';
import { DocumentTypeStatsDto } from './dto/document-type-stats.dto';
import { DocumentTypeStatsService } from './document-type-stats.service';








@ApiTags('Document Types')
@Controller('document-types')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class DocumentTypeController {
  constructor(private readonly service: DocumentTypeService,
    private readonly statsService: DocumentTypeStatsService) {}


    @Get('stats')
  // @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Obtenir les statistiques des types de documents' })
  @ApiResponse({ status: 200, type: DocumentTypeStatsDto })
  async getStats(): Promise<any> {
    return this.statsService.getStats();
  }

  @Get('stats/:id')
  // @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Obtenir les statistiques d\'un type de document spécifique' })
  @ApiParam({ name: 'id', description: 'ID du type de document' })
  async getStatsForType(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<any> {
    return this.statsService.getStats(id);
  }

  @Get('stats/by-status')
  // @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Obtenir les statistiques par statut' })
  async getStatsByStatus() {
    const stats = await this.statsService.getStats();
    return (stats as any).byStatus;
  }

  @Get('stats/by-customer-type')
  // @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Obtenir les statistiques par type de client' })
  async getStatsByCustomerType() {
    const stats = await this.statsService.getStats();
    return (stats as any).byCustomerType;
  }

  @Get('stats/top')
  // @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Obtenir les types de documents les plus utilisés' })
  async getTopDocumentTypes() {
    const stats = await this.statsService.getStats();
    return (stats as any).topDocumentTypes;
  }

  @Get('stats/usage')
  // @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Obtenir les statistiques d\'utilisation' })
  async getUsageStats() {
    const stats = await this.statsService.getStats();
    return (stats as any).usageStats;
  }

  @Get('stats/mime-types')
  // @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Obtenir les statistiques par type MIME' })
  async getMimeTypeStats() {
    const stats = await this.statsService.getStats();
    return (stats as any).mimeTypeStats;
  }

  @Get('/search')
  @ApiOperation({ summary: 'Rechercher des audiences avec filtres' })
  @ApiResponse({ status: 200, type: [Any] })
  async search(
    @Query() searchParams?: Record<string, any>,
    @Query() paginationParams?: PaginationParamsDto,
  ) {
    return await this.service.searchWithTransformer(
      searchParams as SearchCriteria,
      DocumentTypeResponseDto,
      paginationParams,
    );
  }
  @Post()
  @ApiOperation({ summary: 'Créer un type de document' })
  @ApiResponse({ status: 201, description: 'Type de document créé' })
  @RequirePermissions('CREATE_DOCUMENT_TYPE')
  create(@Body() createDto: CreateDocumentTypeDto) {
    return this.service.create(createDto);
  }

  @Get()
  @ApiOperation({ summary: 'Lister tous les types de documents' })
  @RequirePermissions('VIEW_DOCUMENT_TYPE')
  findAll() {
    return this.service.findAll();
  }

 /**
   * POST /document-types/get/by/category
   * Body: { filter: { categoryId: 2 } }
   */
  @Get('get/by/category')
  // @HttpCode(HttpStatus.OK)
  async getAllByCategory(
    @Query() searchParams?: Record<string, any>,
    // @Query() paginationParams?: PaginationParamsDto,
  ): Promise<any> {
    const category_id = searchParams?.category_id || {};
    console.log('Received filter:',JSON.stringify(searchParams) );
    if(!category_id) {
      return null
      // throw new BadRequestException('Le champ categoryId est requis dans le filtre');
    }
    return this.service.getAllByCategory(category_id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Récupérer un type de document' })
  @RequirePermissions('VIEW_DOCUMENT_TYPE')
  findOne(@Param('id') id: string) {
    return this.service.findOne(+id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Mettre à jour un type de document' })
  @RequirePermissions('EDIT_DOCUMENT_TYPE')
  update(@Param('id') id: string, @Body() updateDto: UpdateDocumentTypeDto) {
    return this.service.update(+id, updateDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer un type de document' })
  @RequirePermissions('DELETE_DOCUMENT_TYPE')
  remove(@Param('id') id: string) {
    return this.service.remove(+id);
  }
}