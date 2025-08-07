import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';




import { CreatePersonnelDto } from './dto/create-personnel.dto';
import { UpdatePersonnelDto } from './dto/update-personnel.dto';
import { PersonnelService } from './personnel.service';





@ApiTags('personnel')
@Controller('personnel')
export class PersonnelController {
  constructor(private readonly personnel_service: PersonnelService) {}

  @Post()
  create(@Body() dto: CreatePersonnelDto) {
    return this.personnel_service.create(dto);
  }

  @Get()
  findAll() {
    return this.personnel_service.findAll();
  }
  @Get('non-commercial-partner')
  findAllExceptCommercialAndPartner() {
    return this.personnel_service.findAllExceptCommercialAndPartner();
  }
  @Get(':id')
  findOne(@Param('id') id: number) {
    return this.personnel_service.findOne(id);
  }

  @Put(':id')
  update(@Param('id') id: number, @Body() dto: UpdatePersonnelDto) {
    return this.personnel_service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: number) {
    return this.personnel_service.remove(id);
  }

}
