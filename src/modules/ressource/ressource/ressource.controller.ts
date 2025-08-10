import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';

import { PermissionsGuard } from 'src/core/common/guards/permissions.guard';
import { RequirePermissions } from 'src/core/decorators/permissions.decorator';
import { Controller, Get, Post, Body, Param, Delete, UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';


import { CreateRessourceDto } from './dto/create-ressource.dto';
import { RessourceService } from './ressource.service';




@Controller('ressource')
@ApiBearerAuth()
export class RessourceController {
  constructor(private readonly ressourceService: RessourceService) {}

  @Post()
     @UseGuards(JwtAuthGuard, PermissionsGuard)
      @RequirePermissions('CREATE_RESSOURCE')
  create(@Body() createRessourceDto: CreateRessourceDto) {
    return this.ressourceService.create(createRessourceDto);
  }

  @Get()
  findAll() {
    return this.ressourceService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.ressourceService.findOne(+id);
  }

  /*@Patch(':id')EDIT_RESSOURCE
  update(@Param('id') id: string, @Body() updateRessourceDto: UpdateRessourceDto) {
    return this.ressourceService.update(+id, updateRessourceDto);
  }*/

  @Delete(':id')
     @UseGuards(JwtAuthGuard, PermissionsGuard)
    @RequirePermissions('DELETE_RESSOURCE')
  remove(@Param('id') id: string) {
    return this.ressourceService.remove(+id);
  }
}
