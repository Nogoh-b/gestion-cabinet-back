// src/modules/findings/findings.controller.ts
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
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CreateFindingDto } from './dto/create-finding.dto';
import { UpdateFindingDto } from './dto/update-finding.dto';
import { FindingResponseDto, FindingListResponseDto } from './dto/response-finding.dto';
import { FindingSearchDto } from './dto/search-finding.dto';
import { PaginationParamsDto } from 'src/core/shared/dto/pagination-params.dto';
import { SearchCriteria } from 'src/core/shared/services/search/base-v1.service';
import { FindingsService } from './finding.service';

@ApiTags('Findings')
@Controller('findings')
export class FindingsController {
  constructor(private readonly findingsService: FindingsService) {}

  @Post()
  @ApiOperation({ summary: 'Créer un nouveau finding (anomalie/risque)' })
  @ApiResponse({ status: 201, type: FindingResponseDto })
  async create(@Body() createFindingDto: CreateFindingDto) {
    return await this.findingsService.create(createFindingDto);
  }

  @Get('/search')
  @ApiOperation({ summary: 'Rechercher des findings avec filtres' })
  @ApiResponse({ status: 200, type: [FindingListResponseDto] })
  async search(
    @Query() searchParams?: FindingSearchDto,
    @Query() paginationParams?: PaginationParamsDto,
  ) {
    return await this.findingsService.searchWithTransformer(
      searchParams as SearchCriteria,
      FindingListResponseDto,
      paginationParams,
    );
  }

  @Get()
  @ApiOperation({ summary: 'Lister tous les findings' })
  @ApiResponse({ status: 200, type: [FindingListResponseDto] })
  async findAll() {
    return await this.findingsService.findAll();
  }

  @Get('get/:id')
  @ApiOperation({ summary: 'Obtenir un finding par ID' })
  @ApiResponse({ status: 200, type: FindingResponseDto })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return await this.findingsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Mettre à jour un finding' })
  @ApiResponse({ status: 200, type: FindingResponseDto })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateFindingDto: UpdateFindingDto,
  ) {
    return await this.findingsService.update(id, updateFindingDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer un finding' })
  @ApiResponse({ status: 200, description: 'Finding supprimé avec succès' })
  async remove(@Param('id', ParseIntPipe) id: number) {
    return await this.findingsService.remove(id);
  }

  @Post(':id/validate')
  @ApiOperation({ summary: 'Valider un finding' })
  @ApiResponse({ status: 200, type: FindingResponseDto })
  async validate(
    @Param('id', ParseIntPipe) id: number,
    @Body('userId') userId: number,
  ) {
    return await this.findingsService.validate(id, userId);
  }

  @Post(':id/resolve')
  @ApiOperation({ summary: 'Marquer un finding comme résolu' })
  @ApiResponse({ status: 200, type: FindingResponseDto })
  async resolve(@Param('id', ParseIntPipe) id: number) {
    return await this.findingsService.resolve(id);
  }

  @Post(':id/waive')
  @ApiOperation({ summary: 'Accepter un risque (waive)' })
  @ApiResponse({ status: 200, type: FindingResponseDto })
  async waive(
    @Param('id', ParseIntPipe) id: number,
    @Body('comment') comment?: string,
  ) {
    return await this.findingsService.waive(id, comment);
  }

  @Get('diligence/:diligenceId')
  @ApiOperation({ summary: 'Récupérer tous les findings d\'une diligence' })
  @ApiResponse({ status: 200, type: [FindingListResponseDto] })
  async findByDiligence(@Param('diligenceId', ParseIntPipe) diligenceId: number) {
    return await this.findingsService.findByDiligence(diligenceId);
  }

  @Get('stats/by-severity')
  @ApiOperation({ summary: 'Statistiques des findings par sévérité' })
  @ApiResponse({ status: 200 })
  async getStatsBySeverity(@Query('diligenceId') diligenceId?: number) {
    return await this.findingsService.getStatsBySeverity(diligenceId);
  }
}