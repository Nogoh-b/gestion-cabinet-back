// permissions.controller.ts
import { Controller, Post, Body, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Permission } from './entities/permission.entity';
import { PermissionsService } from './permission.service';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/core/common/guards/permissions.guard';
import { RequirePermissions } from 'src/core/decorators/permissions.decorator';

@ApiTags('Gestion des Permissions')
@ApiBearerAuth() 
@Controller('permissions')
@UseGuards(JwtAuthGuard, PermissionsGuard)

export class PermissionsController {
  constructor(private readonly service: PermissionsService) {}

  @Post()
  @ApiOperation({ summary: 'Créer une nouvelle permission' })
  @ApiResponse({ status: 201, description: 'Permission créée', type: Permission })
  @RequirePermissions('permissions.create')
  create(@Body() dto: CreatePermissionDto): Promise<Permission> {
    return this.service.create(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  @ApiOperation({ summary: 'Lister toutes les permissions' })
  @RequirePermissions('CREATE_USER')
  findAll(): Promise<Permission[]> {
    return this.service.findAll();
  }

  @Get(':id')
  @RequirePermissions('permissions.viewOne')
  @ApiOperation({ summary: 'Obtenir une permission par ID' })
  findOne(@Param('id') id: number): Promise<Permission> {
    return this.service.findOne(id);
  }

  @Post(':id')
  @RequirePermissions('permissions.remove')
  @ApiOperation({ summary: 'Supprimer une permission' })
  remove(@Param('id') id: number): Promise<void> {
    return this.service.descativePermission(id);
  }
}