// location-cities.controller.ts
import { Controller, Get, Post, Body, Param, Put, Delete } from '@nestjs/common';
import { LocationCitiesService } from './location_city.service';
import { LocationCity } from './entities/location_city.entity';
import { CreateLocationCityDto } from './dto/create-location_city.dto';
import { UpdateLocationCityDto } from './dto/update-location_city.dto';

@Controller('location-cities')
export class LocationCitiesController {
  constructor(private readonly service: LocationCitiesService) {}

  @Post()
  create(@Body() dto: CreateLocationCityDto): Promise<LocationCity> {
    return this.service.create(dto);
  }

  @Get()
  findAll(): Promise<LocationCity[]> {
    return this.service.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: number): Promise<LocationCity> {
    return this.service.findOne(id);
  }

  @Put(':id')
  update(@Param('id') id: number, @Body() dto: UpdateLocationCityDto): Promise<LocationCity> {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: number): Promise<void> {
    return this.service.remove(id);
  }
}