// location-cities.controller.ts
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/core/common/guards/permissions.guard';
import { RequirePermissions } from 'src/core/decorators/permissions.decorator';
import { SearchQueryDto } from 'src/core/shared/dto/advanced-search.dto';
import { Controller, Get, Post, Body, Param, Put, Delete, UseGuards, Query } from '@nestjs/common';












import { ApiBearerAuth, ApiQuery } from '@nestjs/swagger';



import { CreateLocationCityDto } from './dto/create-location_city.dto';
import { UpdateLocationCityDto } from './dto/update-location_city.dto';
import { LocationCity } from './entities/location_city.entity';
import { LocationCitiesService } from './location_city.service';



@Controller('location-cities')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class LocationCitiesController {
  constructor(private readonly service: LocationCitiesService) {}

  @Get('search')
  @ApiQuery({ name: 'term', required: true, type: String })
  @ApiQuery({ name: 'exact', required: false, type: Boolean, example: false })
  @ApiQuery({ name: 'skip', required: false, type: Number, example: 0 })
  @ApiQuery({ name: 'take', required: false, type: Number, example: 10 })
  @ApiQuery({ name: 'orderField', required: false, type: String, example: 'create_at' })
  @ApiQuery({ name: 'orderDir', required: false, enum: ['ASC', 'DESC'], example: 'ASC' })
  async searchUsers(@Query() query: SearchQueryDto) {
    return await this.service.enhancedSearch({
      alias: 'location_city',
      searchTerm: query.term,
      exactMatch: query.exact == 'true',
      skip: Number(query.skip),
      take: Number(query.take),
      orderBy: {
        field: query.orderField,
        direction: query.orderDir,
      },
    });
  }

  @Post()
  @RequirePermissions('MANAGE_LOCATION')
  create(@Body() dto: CreateLocationCityDto): Promise<LocationCity> {
    return this.service.create(dto);
  }

  @Get()
  @RequirePermissions('')
  findAll(): Promise<LocationCity[]> {
    return this.service.findAll();
  }

  @Get(':id')
  @RequirePermissions('')
  findOne(@Param('id') id: number): Promise<LocationCity> {
    return this.service.findOne(id);
  }

  @Get(':id/all')
  @RequirePermissions('')
  findAllS(@Param('id') id: number): Promise<any> {
    return this.service.search()
  }


  @Put(':id')
  @RequirePermissions('MANAGE_LOCATION')
  update(@Param('id') id: number, @Body() dto: UpdateLocationCityDto): Promise<LocationCity> {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('MANAGE_LOCATION')
  remove(@Param('id') id: number): Promise<void> {
    return this.service.remove(id);
  }


}