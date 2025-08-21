// resource_type.controller.ts
import { Controller, Post, Body, Get, Param, Delete, Patch, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';


import { CreateRessourceTypeDto } from './dto/create-ressource-type.dto';
import { UpdateRessourceTypeDto } from './dto/update-ressource-type.dto';
import { RessourceTypeService } from './ressource-type.service';
import { RequirePermissions } from 'src/core/decorators/permissions.decorator';
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/core/common/guards/permissions.guard';



@ApiTags('resource-type')
@Controller('resource-type')
@ApiBearerAuth()
export class RessourceTypeController {
  constructor(private readonly service: RessourceTypeService) {}

  @Post()
   @UseGuards(JwtAuthGuard, PermissionsGuard)
    @RequirePermissions('CREATE_TYPE_RESSOURCE')
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
   @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('EDIT_TYPE_RESSOURCE')
  update(@Param('id') id: string, @Body() updateRessourceTypeDto: UpdateRessourceTypeDto) {
    return this.service.update(+id, updateRessourceTypeDto);
  }
  @Delete(':id')
   @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('DELETE_TYPE_RESSOURCE')
  @ApiOperation({ summary: 'Supprimer un type de ressource' })
  async remove(@Param('id') id: string) {
    await this.service.remove(+id);
    return { message: 'Supprimé avec succès' };
  }
}
