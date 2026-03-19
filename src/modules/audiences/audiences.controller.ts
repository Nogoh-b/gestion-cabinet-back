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

@ApiTags('Audiences')
@Controller('audiences')
export class AudiencesController {
  constructor(private readonly audiencesService: AudiencesService,
    private readonly statsService: AudienceStatsService) {}

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
}
