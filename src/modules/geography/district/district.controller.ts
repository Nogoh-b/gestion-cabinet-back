// districts.controller.ts
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/core/common/guards/permissions.guard';
import { RequirePermissions } from 'src/core/decorators/permissions.decorator';
import { Controller, Get, Post, Body, Param, Put, Delete, UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';


import { LocationCity } from '../location_city/entities/location_city.entity';
import { DistrictsService } from './district.service';
import { CreateDistrictDto } from './dto/create-district.dto';
import { UpdateDistrictDto } from './dto/update-district.dto';
import { District } from './entities/district.entity';



@Controller('districts')
@ApiBearerAuth()
export class DistrictsController {
  constructor(private readonly service: DistrictsService) {}

  @Post()
@UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('MANAGE_LOCATION')
  create(@Body() dto: CreateDistrictDto): Promise<District> {
    return this.service.create(dto);
  }

  @Get()
  @RequirePermissions('')
  findAll(): Promise<District[]> {
    return this.service.findAll();
  }

  @Get(':id')
  @RequirePermissions('')
  findOne(@Param('id') id: number): Promise<District> {
    return this.service.findOne(id);
  }

  @Get(':id/location-cities')
  @RequirePermissions('')
  findOneLocationCities(@Param('id') id: number): Promise<LocationCity[]> {
    return this.service.findOneLocationCities(id);
  }

  @Put(':id')
@UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('MANAGE_LOCATION')
  update(@Param('id') id: number, @Body() dto: UpdateDistrictDto): Promise<District> {
    return this.service.update(id, dto);
  }

  @Delete(':id')
@UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('MANAGE_LOCATION')
  remove(@Param('id') id: number): Promise<void> {
    return this.service.remove(id);
  }
}