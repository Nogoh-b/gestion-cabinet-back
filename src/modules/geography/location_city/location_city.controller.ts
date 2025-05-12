// location-cities.controller.ts
import { Controller, Get, Post, Body, Param, Put, Delete, UseGuards } from '@nestjs/common';
import { LocationCitiesService } from './location_city.service';
import { LocationCity } from './entities/location_city.entity';
import { CreateLocationCityDto } from './dto/create-location_city.dto';
import { UpdateLocationCityDto } from './dto/update-location_city.dto';
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/core/common/guards/permissions.guard';
import { ApiBearerAuth } from '@nestjs/swagger';
import { RequirePermissions } from 'src/core/decorators/permissions.decorator';

@Controller('location-cities')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class LocationCitiesController {
  constructor(private readonly service: LocationCitiesService) {}

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