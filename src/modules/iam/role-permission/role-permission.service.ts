// src/modules/iam/role-permission/role-permission.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RolePermission } from './entities/role-permission.entity';
import { AssignPermissionDto } from './dto/assign-permission.dto';

@Injectable()
export class RolePermissionService {
  constructor(
    @InjectRepository(RolePermission)
    private rolePermissionRepository: Repository<RolePermission>,
  ) {}

  // Assigner des permissions
  async assignPermissions(roleId: number, dto: AssignPermissionDto): Promise<void> {
    const assignments = dto.permissionIds.map(permissionId => ({
      roleId,
      permissionId,
      status: 1, // Actif par défaut
    }));
    await this.rolePermissionRepository.save(assignments);
  }

  // Récupérer les permissions d'un rôle
  async getRolePermissions(roleId: number): Promise<RolePermission[]> {
    return this.rolePermissionRepository.find({
      where: { roleId },
      relations: ['permission'],
    });
  }

  // Modifier le statut
  async updateStatus(
    roleId: number,
    permissionId: number,
    status: number,
  ): Promise<any> {
    return this.rolePermissionRepository.update(
      { roleId, permissionId },
      { status },
    );
  }

  // Supprimer une permission
  async removePermission(roleId: number, permissionId: number): Promise<void> {
    await this.rolePermissionRepository.delete({ roleId, permissionId });
  }
}