// divisions.controller.ts
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/core/common/guards/permissions.guard';
import { RequirePermissions } from 'src/core/decorators/permissions.decorator';
import { Controller, Get, Post, Body, Param, Put, Delete, UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';

import { District } from '../district/entities/district.entity';
import { DivisionsService } from './divivion.service';
import { CreateDivisionDto } from './dto/create-divivion.dto';
import { UpdateDivisionDto } from './dto/update-divivion.dto';
import { Division } from './entities/divivion.entity';


@Controller('divisions')
@ApiBearerAuth()
export class DivisionsController {
  constructor(private readonly service: DivisionsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('MANAGE_LOCATION')
  create(@Body() dto: CreateDivisionDto): Promise<Division> {
    return this.service.create(dto);
  }

  @Get()
  @RequirePermissions('')
  findAll(): Promise<Division[]> {
    return this.service.findAll();
  }

  @Get(':id')
  @RequirePermissions('')
  findOne(@Param('id') id: number): Promise<Division> {
    return this.service.findOne(id);
  }

  @Get(':id/district')
  @RequirePermissions('')
  findOneDistrict(@Param('id') id: number): Promise<District []> {
    return this.service.findOneDistrict(id);
  }

  @Put(':id')
@UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('MANAGE_LOCATION')
  update(@Param('id') id: number, @Body() dto: UpdateDivisionDto): Promise<Division> {
    return this.service.update(id, dto);
  }

  @Delete(':id')
@UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('MANAGE_LOCATION')
  remove(@Param('id') id: number): Promise<void> {
    return this.service.remove(id);
  }
}