import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { TypePersonnelService } from './type_personnel.service';
import { CreateTypePersonnelDto } from './dto/create-type_personnel.dto';
import { UpdateTypePersonnelDto } from './dto/update-type_personnel.dto';
import { RequirePermissions } from 'src/core/decorators/permissions.decorator';
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/core/common/guards/permissions.guard';
import { ApiBearerAuth } from '@nestjs/swagger';

@Controller('type-personnel')
@ApiBearerAuth()
export class TypePersonnelController {
  constructor(private readonly type_personnel_service: TypePersonnelService) {}

  @Post()
   @UseGuards(JwtAuthGuard, PermissionsGuard)
    @RequirePermissions('CREATE_TYPE_PERSONNEL')
  create(@Body() dto: CreateTypePersonnelDto) {
    return this.type_personnel_service.create(dto);
  }

  @Get()
  findAll() {
    return this.type_personnel_service.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: number) {
    return this.type_personnel_service.findOne(id);
  }

  @Put(':id')
   @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('EDIT_TYPE_PERSONNEL')
  update(@Param('id') id: number, @Body() dto: UpdateTypePersonnelDto) {
    return this.type_personnel_service.update(id, dto);
  }

  @Delete(':id')
   @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('DELETE_TYPE_PERSONNEL')
  remove(@Param('id') id: number) {
    return this.type_personnel_service.remove(id);
  }
}
