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
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';








import { AudiencesService } from './audiences.service';
import { CreateAudienceDto } from './dto/create-audience.dto';
import { AudienceListResponseDto, AudienceResponseDto } from './dto/response-audience.dto';
import { AudienceSearchDto } from './dto/search-audience.dto';
import { UpdateAudienceDto } from './dto/update-audience.dto';









@ApiTags('Audiences')
@Controller('audiences')
export class AudiencesController {
  constructor(private readonly audiencesService: AudiencesService) {}

  // ✅ CREATE - POST /audiences
  @Post()
  @ApiOperation({ summary: 'Créer une audience' })
  @ApiResponse({ status: 201, type: AudienceResponseDto })
  async create(@Body() createAudienceDto: CreateAudienceDto) {
    console.log('-------dto ', createAudienceDto)

    return await this.audiencesService.create(createAudienceDto);
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
      AudienceListResponseDto,
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
  @Get('get/:id')
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
