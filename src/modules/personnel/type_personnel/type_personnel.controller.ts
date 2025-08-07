import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { TypePersonnelService } from './type_personnel.service';
import { CreateTypePersonnelDto } from './dto/create-type_personnel.dto';
import { UpdateTypePersonnelDto } from './dto/update-type_personnel.dto';

@Controller('type-personnel')
export class TypePersonnelController {
  constructor(private readonly type_personnel_service: TypePersonnelService) {}

  @Post()
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
  update(@Param('id') id: number, @Body() dto: UpdateTypePersonnelDto) {
    return this.type_personnel_service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: number) {
    return this.type_personnel_service.remove(id);
  }
}
