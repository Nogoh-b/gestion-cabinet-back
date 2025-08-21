import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/core/common/guards/permissions.guard';
import { RequirePermissions } from 'src/core/decorators/permissions.decorator';
import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';



import { CreateRegionDto } from './dto/create-region.dto';
import { UpdateRegionDto } from './dto/update-region.dto';
import { RegionsService } from './region.service';
import { Division } from '../divivion/entities/divivion.entity';




@Controller('region')
@ApiBearerAuth()
export class RegionController {
  constructor(private readonly regionService: RegionsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('MANAGE_LOCATION')
  create(@Body() createRegionDto: CreateRegionDto) {
    return this.regionService.create(createRegionDto);
  }

  @Get()
  @RequirePermissions('')
  findAll() {
    return this.regionService.findAll();
  }

  @Get(':id/division')
  @RequirePermissions('')
  findOneDivision(@Param('id') id: number): Promise<Division[]> {
    return this.regionService.findOneDivision(id);
  }

  @Get(':id')
  @RequirePermissions('')
  findOne(@Param('id') id: string) {
    return this.regionService.findOne(+id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('MANAGE_LOCATION')
  update(@Param('id') id: string, @Body() updateRegionDto: UpdateRegionDto) {
    return this.regionService.update(+id, updateRegionDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('MANAGE_LOCATION')
  remove(@Param('id') id: string) {
    return this.regionService.remove(+id);
  }
}
