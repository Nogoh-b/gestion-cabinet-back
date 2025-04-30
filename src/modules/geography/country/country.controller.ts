// countries.controller.ts
import { Controller, Get, Post, Body, Param, Put, Delete } from '@nestjs/common';
import { Country } from './entities/country.entity';
import { UpdateCountryDto } from './dto/update-country.dto';
import { CountriesService } from './country.service';
import { CreateCountryDto } from './dto/create-country.dto';

@Controller('countries')
export class CountriesController {
  constructor(private readonly service: CountriesService) {}

  @Post()
  create(@Body() dto: CreateCountryDto): Promise<Country> {
    return this.service.create(dto);
  }

  @Get()
  findAll(): Promise<Country[]> {
    return this.service.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: number): Promise<Country> {
    return this.service.findOne(id);
  }

  @Put(':id')
  update(@Param('id') id: number, @Body() dto: UpdateCountryDto): Promise<Country> {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: number): Promise<void> {
    return this.service.remove(id);
  }
}