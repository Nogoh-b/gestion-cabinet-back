// districts.controller.ts
import { Controller, Get, Post, Body, Param, Put, Delete, UseGuards } from '@nestjs/common';
import { CreateDistrictDto } from './dto/create-district.dto';
import { District } from './entities/district.entity';
import { DistrictsService } from './district.service';
import { UpdateDistrictDto } from './dto/update-district.dto';
import { RequirePermissions } from 'src/core/decorators/permissions.decorator';
import { ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/core/common/guards/permissions.guard';

@Controller('districts')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class DistrictsController {
  constructor(private readonly service: DistrictsService) {}

  @Post()
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

  @Put(':id')
  @RequirePermissions('MANAGE_LOCATION')
  update(@Param('id') id: number, @Body() dto: UpdateDistrictDto): Promise<District> {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('MANAGE_LOCATION')
  remove(@Param('id') id: number): Promise<void> {
    return this.service.remove(id);
  }
}