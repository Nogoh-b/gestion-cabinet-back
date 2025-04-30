// permissions.controller.ts
import { Controller, Post, Body, Get, Param, Delete, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Permission } from './entities/permission.entity';
import { PermissionsService } from './permission.service';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';

@ApiTags('Gestion des Permissions')
@ApiBearerAuth('JWT-auth') 
@Controller('permissions')
export class PermissionsController {
  constructor(private readonly service: PermissionsService) {}

  @Post()
  @ApiOperation({ summary: 'Créer une nouvelle permission' })
  @ApiResponse({ status: 201, description: 'Permission créée', type: Permission })
  create(@Body() dto: CreatePermissionDto): Promise<Permission> {
    return this.service.create(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  @ApiOperation({ summary: 'Lister toutes les permissions' })
  findAll(): Promise<Permission[]> {
    return this.service.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtenir une permission par ID' })
  findOne(@Param('id') id: number): Promise<Permission> {
    return this.service.findOne(id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer une permission' })
  remove(@Param('id') id: number): Promise<void> {
    return this.service.remove(id);
  }
}