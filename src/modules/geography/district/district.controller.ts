// districts.controller.ts
import { Controller, Get, Post, Body, Param, Put, Delete } from '@nestjs/common';
import { CreateDistrictDto } from './dto/create-district.dto';
import { District } from './entities/district.entity';
import { DistrictsService } from './district.service';
import { UpdateDistrictDto } from './dto/update-district.dto';

@Controller('districts')
export class DistrictsController {
  constructor(private readonly service: DistrictsService) {}

  @Post()
  create(@Body() dto: CreateDistrictDto): Promise<District> {
    return this.service.create(dto);
  }

  @Get()
  findAll(): Promise<District[]> {
    return this.service.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: number): Promise<District> {
    return this.service.findOne(id);
  }

  @Put(':id')
  update(@Param('id') id: number, @Body() dto: UpdateDistrictDto): Promise<District> {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: number): Promise<void> {
    return this.service.remove(id);
  }
}