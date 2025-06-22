// location-cities.controller.ts
import { plainToInstance } from 'class-transformer';
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/core/common/guards/permissions.guard';
import { RequirePermissions } from 'src/core/decorators/permissions.decorator';












import { Controller, Get, Post, Body, Param, Put, Delete, UseGuards, Query, DefaultValuePipe, ParseBoolPipe, ParseIntPipe } from '@nestjs/common';





import { ApiBearerAuth, ApiQuery } from '@nestjs/swagger';




import { CreateLocationCityDto } from './dto/create-location_city.dto';
import { ResponseLocationCityDto } from './dto/response-location_city.dto';
import { UpdateLocationCityDto } from './dto/update-location_city.dto';
import { LocationCity } from './entities/location_city.entity';
import { LocationCitiesService } from './location_city.service';









@Controller('location-cities')
@ApiBearerAuth()
export class LocationCitiesController {
  constructor(private readonly service: LocationCitiesService) {}

  @Get('search')
  @ApiQuery({ name: 'term', required: true, type: String })
  @ApiQuery({ name: 'exact', required: false, type: Boolean, example: false })
  @ApiQuery({ name: 'skip', required: false, type: Number, example: 0 })
  @ApiQuery({ name: 'take', required: false, type: Number, example: 10 })
  @ApiQuery({ name: 'orderField', required: false, type: String, example: 'createdAt' })
  @ApiQuery({ name: 'orderDir', required: false, enum: ['ASC', 'DESC'], example: 'ASC' })
  async searchLoc(
    @Query('term') term: string,
    @Query('exact', new DefaultValuePipe(false), ParseBoolPipe) exact: boolean,
    @Query('skip', new DefaultValuePipe(0), ParseIntPipe) skip: number,
    @Query('take', new DefaultValuePipe(10), ParseIntPipe) take: number,
    @Query('orderField', new DefaultValuePipe('createdAt')) orderField: string,
    @Query('orderDir', new DefaultValuePipe('ASC')) orderDir: 'ASC' | 'DESC',
  ) {
    console.log('searchLoc', term, exact, skip, take, orderField, orderDir);
    const locCities = await this.service.enhancedSearch({
      alias: 'location_city',
      searchTerm: term,
      exactMatch: exact,
      skip,
      take,
      orderBy: {
        field: orderField,
        direction: orderDir,
      },
    });
    return plainToInstance(ResponseLocationCityDto, locCities);
  }

  @Post()
@UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('MANAGE_LOCATION')
  create(@Body() dto: CreateLocationCityDto): Promise<LocationCity> {
    return this.service.create(dto);
  }

  @Get()
  @RequirePermissions('')
  findAll(): Promise<ResponseLocationCityDto[]> {
    return this.service.findAll();
  }

  @Get(':id')
  @RequirePermissions('')
  findOne(@Param('id') id: number): Promise<ResponseLocationCityDto> {
    return this.service.findOne(id);
  }

  @Get(':id/all')
  @RequirePermissions('')
  findAllS(@Param('id') id: number): Promise<any> {
    return this.service.search()
  }


  @Put(':id')
@UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('MANAGE_LOCATION')
  update(@Param('id') id: number, @Body() dto: UpdateLocationCityDto): Promise<LocationCity> {
    return this.service.update(id, dto);
  }

  @Delete(':id')
@UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('MANAGE_LOCATION')
  remove(@Param('id') id: number): Promise<void> {
    return this.service.remove(id);
  }


}