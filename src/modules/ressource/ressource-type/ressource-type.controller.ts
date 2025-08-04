// resource_type.controller.ts
import { Controller, Post, Body, Get, Param, Delete, Patch } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';


import { CreateRessourceTypeDto } from './dto/create-ressource-type.dto';
import { UpdateRessourceTypeDto } from './dto/update-ressource-type.dto';
import { RessourceTypeService } from './ressource-type.service';



@ApiTags('resource-type')
@Controller('resource-type')
export class RessourceTypeController {
  constructor(private readonly service: RessourceTypeService) {}

  @Post()
  @ApiOperation({ summary: 'Créer un type de ressource' })
  @ApiResponse({ status: 201, description: 'Type créé avec succès' })
  async create(@Body() data: CreateRessourceTypeDto) {
    return await this.service.create(data);
  }

  @Get()
  @ApiOperation({ summary: 'Liste des types de ressource' })
  async findAll() {
    return await this.service.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Détail d\'un type de ressource' })
  async findOne(@Param('id') id: string) {
    return await this.service.findOne(+id);
  }
  @Patch(':id')
  update(@Param('id') id: string, @Body() updateRessourceTypeDto: UpdateRessourceTypeDto) {
    return this.service.update(+id, updateRessourceTypeDto);
  }
  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer un type de ressource' })
  async remove(@Param('id') id: string) {
    await this.service.remove(+id);
    return { message: 'Supprimé avec succès' };
  }
}
