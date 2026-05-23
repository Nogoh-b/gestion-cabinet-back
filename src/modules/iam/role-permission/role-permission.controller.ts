// role-permission.controller.ts
import { Controller, Post, Body, Delete, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { RolePermissionService } from './role-permission.service';
import { CreateRolePermissionDto } from './dto/create-role-permission.dto';
import { RolePermission } from './entities/role-permission.entity';
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/core/common/guards/permissions.guard';
import { RequirePermissions } from 'src/core/decorators/permissions.decorator';

@ApiTags('Gestion des Permissions Rôle')
@Controller('role-permissions')
@ApiBearerAuth() 
@UseGuards(JwtAuthGuard, PermissionsGuard)


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
  @RequirePermissions('manage_roles')
  createRolesPermissions(@Body() dto: CreateRolePermissionDto) {
    return this.service.createRolesPermissions(dto);
  }


  @Delete(':roleId/:permissionId')
  @ApiOperation({ summary: 'Retirer une permission d\'un rôle' })
  @RequirePermissions('manage_roles')
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
  @RequirePermissions('manage_roles')
  async getRolePermissions(@Param('id') roleId: number) {
    return this.service.getRolePermissions(roleId);
  }


  
}