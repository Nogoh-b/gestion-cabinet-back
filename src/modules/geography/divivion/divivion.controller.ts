// divisions.controller.ts
import { Controller, Get, Post, Body, Param, Put, Delete, UseGuards } from '@nestjs/common';
import { DivisionsService } from './divivion.service';
import { Division } from './entities/divivion.entity';
import { CreateDivisionDto } from './dto/create-divivion.dto';
import { UpdateDivisionDto } from './dto/update-divivion.dto';
import { RequirePermissions } from 'src/core/decorators/permissions.decorator';
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { ApiBearerAuth } from '@nestjs/swagger';
import { PermissionsGuard } from 'src/core/common/guards/permissions.guard';

@Controller('divisions')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class DivisionsController {
  constructor(private readonly service: DivisionsService) {}

  @Post()
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

  @Put(':id')
  @RequirePermissions('MANAGE_LOCATION')
  update(@Param('id') id: number, @Body() dto: UpdateDivisionDto): Promise<Division> {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('MANAGE_LOCATION')
  remove(@Param('id') id: number): Promise<void> {
    return this.service.remove(id);
  }
}