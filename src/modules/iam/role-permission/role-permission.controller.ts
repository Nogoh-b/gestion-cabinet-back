// src/modules/iam/role-permission/role-permission.controller.ts
import {
  Controller,
  Post,
  Body,
  Param,
  Get,
  Patch,
  Delete,
  NotFoundException,
} from '@nestjs/common';
import { RolePermissionService } from './role-permission.service';
import { AssignPermissionDto } from './dto/assign-permission.dto';
import { UpdateRolePermissionDto } from './dto/update-role-permission.dto';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('IAM - Role Permissions')
@Controller('iam/roles/:roleId/permissions')
export class RolePermissionController {
  constructor(
    private readonly rolePermissionService: RolePermissionService,
  ) {}

  // 1. Assigner des permissions à un rôle
  @Post()
  @ApiOperation({ summary: 'Assigner des permissions à un rôle' })
  @ApiResponse({ status: 201, description: 'Permissions assignées avec succès' })
  async assignPermissions(
    @Param('roleId') roleId: number,
    @Body() dto: AssignPermissionDto,
  ) {
    await this.rolePermissionService.assignPermissions(roleId, dto);
    return { message: 'Permissions assignées avec succès' };
  }

  // 2. Lister toutes les permissions d'un rôle
  @Get()
  @ApiOperation({ summary: 'Lister les permissions d\'un rôle' })
  async getRolePermissions(@Param('roleId') roleId: number) {
    return this.rolePermissionService.getRolePermissions(roleId);
  }

  // 3. Modifier le statut d'une permission
  @Patch(':permissionId')
  @ApiOperation({ summary: 'Modifier le statut d\'une permission' })
  async updatePermissionStatus(
    @Param('roleId') roleId: number,
    @Param('permissionId') permissionId: number,
    @Body() dto: UpdateRolePermissionDto,
  ) {
    const result = await this.rolePermissionService.updateStatus(
      roleId,
      permissionId,
      dto.status,
    );
    if (!result.affected) throw new NotFoundException('Permission non trouvée');
    return { message: 'Statut mis à jour' };
  }

  // 4. Retirer une permission d'un rôle
  @Delete(':permissionId')
  @ApiOperation({ summary: 'Retirer une permission d\'un rôle' })
  async removePermission(
    @Param('roleId') roleId: number,
    @Param('permissionId') permissionId: number,
  ) {
    await this.rolePermissionService.removePermission(roleId, permissionId);
    return { message: 'Permission retirée' };
  }
}