import { RequirePermissions } from 'src/core/decorators/permissions.decorator';
import { PaginationParamsDto } from 'src/core/shared/dto/pagination-params.dto';
import { Controller, Get, Post, Patch, Body, Param, Query } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery
} from '@nestjs/swagger';


import { CreateJurisdictionDto } from './dto/create-jurisdiction.dto';
import { JurisdictionResponseDto } from './dto/jurisdiction-response.dto';
import { SearchJurisdictionDto } from './dto/search-jurisdiction.dto';
import { UpdateJurisdictionDto } from './dto/update-jurisdiction.dto';
import { JurisdictionService } from './jurisdiction.service';
import { JurisdictionStatsService } from './jurisdiction-stats.service';



@ApiTags('Jurisdictions')
@ApiBearerAuth()
@Controller('jurisdictions')
export class JurisdictionController {
  constructor(private readonly service: JurisdictionService, 
  private readonly statsService: JurisdictionStatsService) {}

  @Get('stats')
  // @Roles(UserRole.ADMIN)
  @ApiQuery({ name: 'startDate', required: false, type: Date })
  @ApiQuery({ name: 'endDate', required: false, type: Date })

  async getStats(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,

  ) {
    return this.statsService.getStats({
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,

    });
  }
  @Post()
  @ApiOperation({ summary: 'Créer une nouvelle juridiction' })
  @ApiResponse({ status: 201, type: JurisdictionResponseDto })
  @RequirePermissions('MANAGE_JURISDICTIONS')
  async create(@Body() dto: CreateJurisdictionDto) {
    return this.service.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Lister toutes les juridictions' })
  @ApiResponse({ status: 200, type: [JurisdictionResponseDto] })
  async findAll() {
    return this.service.findAll();
  }

  @Get('search')
  @ApiOperation({ summary: 'Rechercher des juridictions' })
  @ApiResponse({ status: 200, type: [JurisdictionResponseDto] })
  async search(
    @Query() searchParams: SearchJurisdictionDto,
    @Query() paginationParams?: PaginationParamsDto
  ) {
    return this.service.searchJuridiction(searchParams, paginationParams);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Récupérer une juridiction par ID' })
  @ApiResponse({ status: 200, type: JurisdictionResponseDto })
  async findOne(@Param('id') id: number) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Mettre à jour partiellement une juridiction' })
  @ApiResponse({ status: 200, type: JurisdictionResponseDto })
  @RequirePermissions('MANAGE_JURISDICTIONS')
  async patch(
    @Param('id') id: number,
    @Body() dto: UpdateJurisdictionDto
  ) {
    return this.service.update(id, dto);
  }

  @Post(':id')
  @ApiOperation({ summary: 'Mettre à jour une juridiction' })
  @ApiResponse({ status: 200, type: JurisdictionResponseDto })
  @RequirePermissions('MANAGE_JURISDICTIONS')
  async update(
    @Param('id') id: number,
    @Body() dto: UpdateJurisdictionDto
  ) {
    return this.service.update(id, dto);
  }
}