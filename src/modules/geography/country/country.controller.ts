// countries.controller.ts
import { Controller, Get, Post, Body, Param, Put, Delete, UseGuards } from '@nestjs/common';
import { Country } from './entities/country.entity';
import { UpdateCountryDto } from './dto/update-country.dto';
import { CountriesService } from './country.service';
import { CreateCountryDto } from './dto/create-country.dto';
import { RequirePermissions } from 'src/core/decorators/permissions.decorator';
import { ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/core/common/guards/permissions.guard';
import { Region } from '../region/entities/region.entity';

@Controller('countries')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class CountriesController {
  constructor(private readonly service: CountriesService) {}

  @Post()
  @RequirePermissions('MANAGE_LOCATION')
  create(@Body() dto: CreateCountryDto): Promise<Country> {
    return this.service.create(dto);
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
  @RequirePermissions('MANAGE_LOCATION')
  update(@Param('id') id: number, @Body() dto: UpdateCountryDto): Promise<Country> {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('MANAGE_LOCATION')
  remove(@Param('id') id: number): Promise<void> {
    return this.service.remove(id);
  }
}