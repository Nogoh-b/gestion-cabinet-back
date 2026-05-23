// role-permission.controller.ts
import { Controller, Post, Body, Delete, Get, Param, UseGuards, Logger, ParseIntPipe } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { RolePermissionService } from './role-permission.service';
import { CreateRolePermissionDto } from './dto/create-role-permission.dto';
import { RolePermission } from './entities/role-permission.entity';
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/core/common/guards/permissions.guard';
import { RequirePermissions } from 'src/core/decorators/permissions.decorator';
import { MainGateway } from 'src/core/shared/services/socket/main.gateway';
import { UserRolesService } from '../user-role/user-role.service';

@ApiTags('Gestion des Permissions Rôle')
@Controller('role-permissions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RolePermissionController {
  private readonly logger = new Logger(RolePermissionController.name);

  constructor(
    private readonly service: RolePermissionService,
    private readonly userRolesService: UserRolesService,
    // ModuleRef résout MainGateway dynamiquement depuis le scope global.
    // Cela évite l'erreur de DI quand MainGateway n'est pas visible
    // dans le contexte local d'IamModule malgré le @Global() de CoreModule.
    private readonly moduleRef: ModuleRef,
  ) {
    this.logger.log('[INIT] RolePermissionController instancié ✅');  
  }

  /** Résout MainGateway depuis le scope global — ne crashe jamais */
  private getGateway(): MainGateway | null {
    try {
      return this.moduleRef.get(MainGateway, { strict: false });
    } catch (e) {
      this.logger.error(`[WS] Impossible de résoudre MainGateway: ${e?.message}`);
      return null;
    }
  }

  /** Émet permissions_updated après une modification de rôle */
  private async emitPermissionsUpdated(roleId: number): Promise<void> {
    try {
      const role = await this.userRolesService.findOne(roleId);
      const gateway = this.getGateway();
      if (!gateway) {
        this.logger.warn('[WS] gateway null — émission annulée');
        return;
      }
      this.logger.log(`[WS] → notifyPermissionsUpdated("${role?.code}")`);
      gateway.notifyPermissionsUpdated(role.code);
    } catch (e) {
      this.logger.error(`[WS] Erreur émission: ${e?.message}`, e?.stack);
    }
  }

  @Post('assign-roles')
  @ApiOperation({ summary: 'Assigner une ou des permissions à un rôle' })
  @ApiResponse({ status: 201, description: 'Permission assignée', type: RolePermission })
  @RequirePermissions('manage_roles')
  async createRolesPermissions(@Body() dto: CreateRolePermissionDto) {
    this.logger.log(`[WS] assign-roles — role_id=${dto.role_id}`);
    const result = await this.service.createRolesPermissions(dto);
    await this.emitPermissionsUpdated(dto.role_id);
    return result;
  }

  @Delete(':roleId/:permissionId')
  @ApiOperation({ summary: "Retirer une permission d'un rôle" })
  @RequirePermissions('manage_roles')
  async remove(
    @Param('roleId', ParseIntPipe) roleId: number,
    @Param('permissionId', ParseIntPipe) permissionId: number,
  ) {
    this.logger.log(`[WS] remove — roleId=${roleId} permissionId=${permissionId}`);
    await this.service.remove(roleId, permissionId);
    await this.emitPermissionsUpdated(roleId);
  }

  @Get(':id/permissions')
  @ApiOperation({ summary: "Récupérer les permissions d'un rôle" })
  @ApiResponse({ status: 200, description: 'Permissions récupérées avec succès' })
  @ApiResponse({ status: 404, description: 'Rôle non trouvé' })
  @RequirePermissions('manage_roles')
  async getRolePermissions(@Param('id', ParseIntPipe) roleId: number) {
    return this.service.getRolePermissions(roleId);
  }

  // ── Endpoint de test WebSocket (à retirer après validation) ──────────────
  @Get('test-ws/:roleCode')
  @ApiOperation({ summary: 'Test WebSocket : émet permissions_updated (debug only)' })
  async testWsEmit(@Param('roleCode') roleCode: string) {
    this.logger.log(`[WS TEST] Émission manuelle pour roleCode="${roleCode}"`);
    const gateway = this.getGateway();
    if (gateway) {
      gateway.notifyPermissionsUpdated(roleCode);
      return { ok: true, roleCode };
    }
    return { ok: false, error: 'gateway non disponible' };
  }
}
