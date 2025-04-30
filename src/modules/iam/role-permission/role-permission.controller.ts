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

  @Post()
  @ApiOperation({ summary: 'Assigner une permission à un rôle' })
  @ApiResponse({ status: 201, description: 'Permission assignée', type: RolePermission })
  create(@Body() dto: CreateRolePermissionDto) {
    return this.service.create(dto);
  }

  @Delete(':roleId/:permissionId')
  @ApiOperation({ summary: 'Retirer une permission d\'un rôle' })
  remove(
    @Param('roleId') roleId: number,
    @Param('permissionId') permissionId: number,
  ) {
    return this.service.remove(roleId, permissionId);
  }

  @Get('role/:roleId')
  @ApiOperation({ summary: 'Lister les permissions d\'un rôle' })
  findByRole(@Param('roleId') roleId: number) {
    return this.service.findByRole(roleId);
  }
}