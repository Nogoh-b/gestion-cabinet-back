// role-permission.controller.ts
import { Controller, Post, Body, Delete, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { RolePermissionService } from './role-permission.service';
import { CreateRolePermissionDto } from './dto/create-role-permission.dto';
import { RolePermission } from './entities/role-permission.entity';

@ApiTags('Gestion des Permissions Rôle')
@Controller('role-permissions')
export class RolePermissionController {
  constructor(private readonly service: RolePermissionService) {}

  /*@Post('assign-role')
  @ApiOperation({ summary: 'Assigner une permission à un rôle' })
  @ApiResponse({ status: 201, description: 'Permission assignée', type: RolePermission })
  create(@Body() dto: CreateRolePermissionDto) {
    return this.service.create(dto);
  }*/
  
  @Post('assign-roles')
  @ApiOperation({ summary: 'Assigner une ou des  permissions à un rôle' })
  @ApiResponse({ status: 201, description: 'Permission assignée', type: RolePermission })
  createRolesPermissions(@Body() dto: CreateRolePermissionDto) {
    return this.service.createRolesPermissions(dto);
  }


  @Delete(':roleId/:permissionId')
  @ApiOperation({ summary: 'Retirer une permission d\'un rôle' })
  remove(
    @Param('roleId') roleId: number,
    @Param('permissionId') permissionId: number,
  ) {
    return this.service.remove(roleId, permissionId);
  }

  @Get(':id/permissions')
  @ApiOperation({ summary: "Récupérer les permissions d'un rôle" })
  @ApiResponse({ status: 200, description: 'Permissions récupérées avec succès' })
  @ApiResponse({ status: 404, description: 'Rôle non trouvé' })
  async getRolePermissions(@Param('id') roleId: number) {
    return this.service.getRolePermissions(roleId);
  }


  
}