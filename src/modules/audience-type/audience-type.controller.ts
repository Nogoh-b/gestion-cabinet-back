import { RequirePermissions } from 'src/core/decorators/permissions.decorator';
import { PaginationParamsDto } from 'src/core/shared/dto/pagination-params.dto';
import { SearchCriteria } from 'src/core/shared/services/search/base-v1.service';


import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';




import { AudienceTypeService } from './audience-type.service';
import { AudienceTypeResponseDto } from './dto/audience-type-response.dto';
import { CreateAudienceTypeDto } from './dto/create-audience-type.dto';
import { UpdateAudienceTypeDto } from './dto/update-audience-type.dto';







@ApiTags('Audience Types')
@ApiBearerAuth()
@Controller('audience-types')
export class AudienceTypeController {
  constructor(private readonly service: AudienceTypeService) {}
  
  @Get('search')
  @ApiOperation({ summary: 'Recherche texte avec relations' })
  @ApiResponse({ status: 200, description: 'Résultats de recherche', type: [AudienceTypeResponseDto]  })
  async search(

    @Query() searchParams?: AudienceTypeResponseDto,
    @Query() paginationParams?: PaginationParamsDto,
  ) {
    return this.service.searchWithTransformer(searchParams as SearchCriteria, AudienceTypeResponseDto , paginationParams);
  }

  @Post()
  @ApiOperation({ summary: 'Créer un nouveau type d\'audience' })
  @ApiResponse({ status: 201, type: AudienceTypeResponseDto })
  @RequirePermissions('MANAGE_AUDIENCE_TYPES')
  async create(@Body() dto: CreateAudienceTypeDto) {
    return this.service.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Lister tous les types d\'audience' })
  @ApiResponse({ status: 200, type: [AudienceTypeResponseDto] })
  async findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Récupérer un type d\'audience par ID' })
  @ApiResponse({ status: 200, type: AudienceTypeResponseDto })
  async findOne(@Param('id') id: number) {
    return this.service.findOne(id);
  }

  @Post(':id')
  @ApiOperation({ summary: 'Mettre à jour un type d\'audience' })
  @ApiResponse({ status: 200, type: AudienceTypeResponseDto })
  @RequirePermissions('MANAGE_AUDIENCE_TYPES')
  async update(
    @Param('id') id: number,
    @Body() dto: UpdateAudienceTypeDto
  ) {
    return this.service.update(id, dto);
  }
}