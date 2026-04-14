// countries.controller.ts
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/core/common/guards/permissions.guard';
import { RequirePermissions } from 'src/core/decorators/permissions.decorator';
import { Controller, Get, Post, Body, Param, Put, Delete, UseGuards, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';




import { Region } from '../region/entities/region.entity';
import { CountriesService } from './country.service';
import { CreateCountryDto } from './dto/create-country.dto';
import { UpdateCountryDto } from './dto/update-country.dto';
import { Country } from './entities/country.entity';
import { CountrySearchDto } from './dto/country-search.dto';
import { PaginationParamsDto } from 'src/core/shared/dto/pagination-params.dto';
import { SearchCriteria } from 'src/core/shared/services/search/base-v1.service';





@Controller('countries')
@ApiBearerAuth()
export class CountriesController {
  constructor(private readonly service: CountriesService) {}

  @Post()
  @RequirePermissions('MANAGE_LOCATION')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  create(@Body() dto: CreateCountryDto): Promise<Country> {
    return this.service.create(dto);
  }

  
  @Get('/search')
  @ApiOperation({ summary: 'Rechercher les pays' })
  @ApiResponse({ status: 200, description: 'Liste des pays', type: [Country] })
  async search(
    @Query() searchParams?: CountrySearchDto,
    @Query() paginationParams?: PaginationParamsDto,
  ) {
    return this.service.searchWithTransformer(searchParams as SearchCriteria, Country, paginationParams);
  }


  @Get()
  @RequirePermissions('')
  findAll(): Promise<Country[]> {
    return this.service.findAll();
  }

  @Get(':id')
  @RequirePermissions('')
  findOne(@Param('id') id: number): Promise<Country> {
    return this.service.findOne(id);
  }

  @Get(':id/regions')
  @RequirePermissions('')
  findOneRegions(@Param('id') id: number): Promise<Region[]> {
    return this.service.findOneRegions(id);
  }


  @Put(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('MANAGE_LOCATION')
  update(@Param('id') id: number, @Body() dto: UpdateCountryDto): Promise<Country> {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('MANAGE_LOCATION')
  remove(@Param('id') id: number): Promise<void> {
    return this.service.remove(id);
  }
}