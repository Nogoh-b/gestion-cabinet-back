import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { RessourceTypeService } from './ressource-type.service';
import { CreateRessourceTypeDto } from './dto/create-ressource-type.dto';
import { UpdateRessourceTypeDto } from './dto/update-ressource-type.dto';

@Controller('ressource-type')
export class RessourceTypeController {
  constructor(private readonly ressourceTypeService: RessourceTypeService) {}

  @Post()
  create(@Body() createRessourceTypeDto: CreateRessourceTypeDto) {
    return this.ressourceTypeService.create(createRessourceTypeDto);
  }

  @Get()
  findAll() {
    return this.ressourceTypeService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.ressourceTypeService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateRessourceTypeDto: UpdateRessourceTypeDto) {
    return this.ressourceTypeService.update(+id, updateRessourceTypeDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.ressourceTypeService.remove(+id);
  }
}
