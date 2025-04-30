// divisions.controller.ts
import { Controller, Get, Post, Body, Param, Put, Delete } from '@nestjs/common';
import { DivisionsService } from './divivion.service';
import { Division } from './entities/divivion.entity';
import { CreateDivisionDto } from './dto/create-divivion.dto';
import { UpdateDivisionDto } from './dto/update-divivion.dto';

@Controller('divisions')
export class DivisionsController {
  constructor(private readonly service: DivisionsService) {}

  @Post()
  create(@Body() dto: CreateDivisionDto): Promise<Division> {
    return this.service.create(dto);
  }

  @Get()
  findAll(): Promise<Division[]> {
    return this.service.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: number): Promise<Division> {
    return this.service.findOne(id);
  }

  @Put(':id')
  update(@Param('id') id: number, @Body() dto: UpdateDivisionDto): Promise<Division> {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: number): Promise<void> {
    return this.service.remove(id);
  }
}