// src/modules/diligences/diligences.controller.ts
import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CreateDiligenceDto } from './dto/create-diligence.dto';
import { UpdateDiligenceDto } from './dto/update-diligence.dto';
import { DiligenceResponseDto } from './dto/response-diligence.dto';
import { DiligenceSearchDto } from './dto/search-diligence.dto';
import { PaginationParamsDto } from 'src/core/shared/dto/pagination-params.dto';
import { SearchCriteria } from 'src/core/shared/services/search/base-v1.service';
import { DiligencesService } from './diligence.service';
import { DiligenceStatsService } from './diligence-stats.service';

@ApiTags('Diligences')
@Controller('diligences')
export class DiligencesController {
  constructor(private readonly diligencesService: DiligencesService,
  private readonly statsService: DiligenceStatsService) {}




  @Get('stats')
  // @Roles(UserRole.ADMIN, UserRole.AVOCAT)
  @ApiQuery({ name: 'startDate', required: false, type: Date })
  @ApiQuery({ name: 'endDate', required: false, type: Date })
  @ApiQuery({ name: 'lawyerId', required: false, type: Number })
  @ApiQuery({ name: 'dossierId', required: false, type: Number })
  @ApiOperation({ summary: 'Obtenir les statistiques des diligences' })
  async getStats(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('lawyerId') lawyerId?: number,
    @Query('dossierId') dossierId?: number,
  ): Promise<any> {
    return this.statsService.getStats({
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      lawyerId: lawyerId ? +lawyerId : undefined,
      dossierId: dossierId ? +dossierId : undefined,
    });
  }

  @Get('stats/:id')
  // @Roles(UserRole.ADMIN, UserRole.AVOCAT)
  @ApiOperation({ summary: 'Obtenir les statistiques d\'une diligence spécifique' })
  @ApiParam({ name: 'id', description: 'ID de la diligence' })
  async getStatsForDiligence(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<any> {
    return this.statsService.getStats({ diligenceId: id });
  }

  @Get('upcoming')
  // @Roles(UserRole.ADMIN, UserRole.AVOCAT)
  async getUpcomingDeadlines() {
    const stats = await this.statsService.getStats({});
    return (stats as any).upcomingDeadlines;
  }

  @Get('overdue')
  // @Roles(UserRole.ADMIN, UserRole.AVOCAT)
  async getExpiredDeadlines() {
    const stats = await this.statsService.getStats({});
    return (stats as any).expiredDeadlines;
  }

  
  @Post()
  @ApiOperation({ summary: 'Créer une nouvelle mission de diligence' })
  @ApiResponse({ status: 201, type: DiligenceResponseDto })
  async create(@Body() createDiligenceDto: CreateDiligenceDto) {
    return await this.diligencesService.create(createDiligenceDto);
  }

  @Get('/search')
  @ApiOperation({ summary: 'Rechercher des diligences avec filtres' })
  @ApiResponse({ status: 200, type: [DiligenceResponseDto] })
  async search(
    @Query() searchParams?: DiligenceSearchDto,
    @Query() paginationParams?: PaginationParamsDto,
  ) {
    return await this.diligencesService.searchWithTransformer(
      searchParams as SearchCriteria,
      DiligenceResponseDto,
      paginationParams,
    );
  }

  @Get()
  @ApiOperation({ summary: 'Lister toutes les diligences' })
  @ApiResponse({ status: 200, type: [DiligenceResponseDto] })
  async findAll() {
    return await this.diligencesService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtenir une diligence par ID' })
  @ApiResponse({ status: 200, type: DiligenceResponseDto })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return await this.diligencesService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Mettre à jour une diligence' })
  @ApiResponse({ status: 200, type: DiligenceResponseDto })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDiligenceDto: UpdateDiligenceDto,
  ) {
    return await this.diligencesService.update(id, updateDiligenceDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer une diligence' })
  @ApiResponse({ status: 200, description: 'Diligence supprimée avec succès' })
  async remove(@Param('id', ParseIntPipe) id: number) {
    return await this.diligencesService.remove(id);
  }

  @Post(':id/complete')
  @ApiOperation({ summary: 'Marquer une diligence comme terminée' })
  @ApiResponse({ status: 200, type: DiligenceResponseDto })
  async complete(
    @Param('id', ParseIntPipe) id: number,
    @Body('recommendations') recommendations?: string,
  ) {
    return await this.diligencesService.complete(id, recommendations);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Annuler une diligence' })
  @ApiResponse({ status: 200, type: DiligenceResponseDto })
  async cancel(
    @Param('id', ParseIntPipe) id: number,
    @Body('reason') reason?: string,
  ) {
    return await this.diligencesService.cancel(id, reason);
  }

  @Post(':id/generate-report')
  @ApiOperation({ summary: 'Générer le rapport final de diligence' })
  @ApiResponse({ status: 200, type: DiligenceResponseDto })
  async generateReport(@Param('id', ParseIntPipe) id: number) {
    return await this.diligencesService.generateReport(id);
  }

  @Post(':id/documents')
  @ApiOperation({ summary: 'Ajouter des documents à la diligence' })
  @ApiResponse({ status: 200, type: DiligenceResponseDto })
  async addDocuments(
    @Param('id', ParseIntPipe) id: number,
    @Body('documentIds') documentIds: number[],
  ) {
    return await this.diligencesService.addDocumentsToDiligence(id, documentIds);
  }

  @Get('upcoming/deadlines')
  @ApiOperation({ summary: 'Récupérer les diligences avec échéances proches' })
  @ApiResponse({ status: 200, type: [DiligenceResponseDto] })
  async findUpcomingDeadlines(@Query('days') days: number = 7) {
    return await this.diligencesService.findUpcomingDeadlines(days);
  }

  @Get('overdue')
  @ApiOperation({ summary: 'Récupérer les diligences en retard' })
  @ApiResponse({ status: 200, type: [DiligenceResponseDto] })
  async findOverdue() {
    return await this.diligencesService.findOverdue();
  }


}