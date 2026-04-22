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
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AudiencesService } from './audiences.service';
import { CreateAudienceDto } from './dto/create-audience.dto';
import { AudienceListResponseDto, AudienceResponseDto } from './dto/response-audience.dto';
import { AudienceSearchDto } from './dto/search-audience.dto';
import { UpdateAudienceDto } from './dto/update-audience.dto';
import { AudienceStatsService } from './audience-stats.service';
import { AudienceDecisionService } from './audience-decision.service';
import { AddDecisionResponseDto, DecisionAudienceDto } from './dto/decision-audience.dto';

@ApiTags('Audiences')
@Controller('audiences')
export class AudiencesController {
  constructor(
    private readonly audiencesService: AudiencesService,
    private readonly decisionService: AudienceDecisionService, // Ajouter ceci
    private readonly statsService: AudienceStatsService
    ) {}

  // ✅ CREATE - POST /audiences
  @Post()
  @ApiOperation({ summary: 'Créer une audience' })
  @ApiResponse({ status: 201, type: AudienceResponseDto })
  async create(@Body() createAudienceDto: CreateAudienceDto) {
    console.log('-------dto ', createAudienceDto)

    return await this.audiencesService.create(createAudienceDto);
  }

    @Get('stats')
    @ApiQuery({ name: 'startDate', required: false, type: Date })
    @ApiQuery({ name: 'endDate', required: false, type: Date })
  // @Roles(UserRole.ADMIN, UserRole.AVOCAT)
  async getSummary(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.statsService.getStats({
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      fieldToUseForDate : 'audience_date'
    });
  }

  // ✅ SEARCH - GET /audiences/search
  @Get('/search')
  @ApiOperation({ summary: 'Rechercher des audiences avec filtres' })
  @ApiResponse({ status: 200, type: [AudienceListResponseDto] })
  async search(
    @Query() searchParams?: AudienceSearchDto,
    @Query() paginationParams?: PaginationParamsDto,
  ) {
    return await this.audiencesService.searchWithTransformer(
      searchParams as SearchCriteria,
      AudienceResponseDto,
      paginationParams,
    );
  }

  // ✅ LIST - GET /audiences
  @Get()
  @ApiOperation({ summary: 'Lister toutes les audiences' })
  @ApiResponse({ status: 200, type: [AudienceListResponseDto] })
  async findAll() {
    return await this.audiencesService.findAll();
  }

  // ✅ GET BY ID - GET /audiences/:id
  @Get(':id')
  @ApiOperation({ summary: 'Obtenir une audience par ID' })
  @ApiResponse({ status: 200, type: AudienceResponseDto })
  async findOne(@Param('id') id: string) {
    return await this.audiencesService.findOne(+id);
  }

  // ✅ UPDATE - PATCH /audiences/:id
  @Patch(':id')
  @ApiOperation({ summary: 'Mettre à jour une audience' })
  @ApiResponse({ status: 200, type: AudienceResponseDto })
  async update(@Param('id') id: string, @Body() updateAudienceDto: UpdateAudienceDto) {
    return await this.audiencesService.update(+id, updateAudienceDto);
  }

  // ✅ DELETE - DELETE /audiences/:id
  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer une audience' })
  @ApiResponse({ status: 200, description: 'Audience supprimée avec succès' })
  async remove(@Param('id') id: string) {
    return await this.audiencesService.remove(+id);
  }


  /**
   * ✅ AJOUTER UNE DÉCISION - POST /audiences/:id/decision
   */
  @Post(':id/decision')
  @ApiOperation({ summary: 'Ajouter une décision à une audience' })
  @ApiResponse({ status: 201, type: AddDecisionResponseDto })
  async addDecision(
    @Param('id') id: string,
    @Body() decisionDto: DecisionAudienceDto,
  ) {
    const decision =  await this.decisionService.addDecision(+id, decisionDto);
    return await this.audiencesService.findOneV1(+id)
  }

  /**
   * reprogramer audience
   */
  @Post(':id/postpone/to')
  @ApiOperation({ summary: 'Ajouter une décision à une audience' })
  @ApiResponse({ status: 201, type: AddDecisionResponseDto })
  async postpone(
    @Param('id') id: string,
    @Body() updateDto: UpdateAudienceDto,
  ) {
    console.log('updateDtoAA ', updateDto)

    const audience =  await this.audiencesService.postpone(+id, updateDto);
    return audience
  }

  /**
   * ✅ MODIFIER UNE DÉCISION - PATCH /audiences/:id/decision
   */
  @Patch(':id/decision')
  @ApiOperation({ summary: 'Modifier la décision d\'une audience' })
  @ApiResponse({ status: 200, type: AddDecisionResponseDto })
  async updateDecision(
    @Param('id') id: string,
    @Body() decisionDto: DecisionAudienceDto,
  ) {
    const decision =   await this.decisionService.updateDecision(+id, decisionDto);
        return await this.audiencesService.findOneV1(+id)
  }

  /**
   * ✅ RÉCUPÉRER LA DÉCISION - GET /audiences/:id/decision
   */
  @Get(':id/decision')
  @ApiOperation({ summary: 'Récupérer la décision d\'une audience' })
  async getDecision(@Param('id') id: string) {
    return await this.decisionService.getDecision(+id);
    
  }

  /**
   * ✅ SUPPRIMER UN DOCUMENT DE LA DÉCISION - DELETE /audiences/:id/decision/documents/:documentId
   */
  @Delete(':id/decision/documents/:documentId')
  @ApiOperation({ summary: 'Supprimer un document de la décision' })
  async removeDecisionDocument(
    @Param('id') id: string,
    @Param('documentId') documentId: string,
  ) {
    return await this.decisionService.removeDecisionDocument(+id, +documentId);
  }
}
