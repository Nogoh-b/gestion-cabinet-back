// role-permission.service.ts
import { Injectable, ConflictException, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateRolePermissionDto } from './dto/create-role-permission.dto';
import { RolePermission } from './entities/role-permission.entity';
import { UserRolesService } from '../user-role/user-role.service';
import { PermissionsService } from '../permission/permission.service';
import { Permission } from '../permission/entities/permission.entity';
import { validateDto } from 'src/core/shared/pipes/validate-dto';

@Injectable()
export class RolePermissionService {
  constructor(
    @InjectRepository(RolePermission)
    private readonly rolePermissionRepository: Repository<RolePermission>,
    @Inject(forwardRef(() => UserRolesService))
    private readonly userRolesService: UserRolesService,
    private readonly permissionsService: PermissionsService,
  ) {}


  async createRolesPermissions(createDto: CreateRolePermissionDto): Promise<any> {
    await validateDto(CreateRolePermissionDto, createDto);
    const role = await this.userRolesService.findOne(createDto.role_id);

    for (const element of createDto.permissions_ids) {
      // Ignorer silencieusement les permissions déjà assignées (idempotent)
      const exists = await this.rolePermissionRepository.findOne({
        where: { role_id: createDto.role_id, permission_id: element },
      });
      if (exists) continue;

      const permission = await this.permissionsService.findOne(element);
      const rolePermission = this.rolePermissionRepository.create({
        role_id: createDto.role_id,
        permission_id: element,
        status: 1,
      });
      await this.rolePermissionRepository.save({ ...rolePermission, role, permission });
    }

    return this.userRolesService.findOne(createDto.role_id);
  }

  async remove(role_id: number, permission_id: number): Promise<void> {
    const result = await this.rolePermissionRepository.delete({ role_id, permission_id });

    if (result.affected === 0) {
      throw new NotFoundException('Association rôle-permission non trouvée');
    }
  }

  async findByRole(role_id: number): Promise<RolePermission[]> {
    return this.rolePermissionRepository.find({
      where: { role_id },
      relations: ['permission','role']
    });
  }

async getPermissionsByRole(role_id: number): Promise<Permission[]> {
  return this.rolePermissionRepository
    .createQueryBuilder('rp')
    .innerJoinAndSelect('rp.permission', 'permission')
    .where('rp.role_id = :role_id', { role_id })
    .select([
      'permission.id', 
      'permission.code', 
      'permission.description',
      'permission.status',
      'permission.created_at',
      'permission.updated_at'
    ])
    .getMany()
    .then(results => results.map(r => r.permission));
}

  async findByPermission(permission_id: number): Promise<RolePermission[]> {
    return this.rolePermissionRepository.find({
      where: { permission_id },
      relations: ['role','permission']
    });
  }

  async getRolePermissions(role_id: number): Promise<Permission[]> {
    const permissions = await this.rolePermissionRepository.find({
      where: { role_id },
      relations: ['permission'],
    });
    return permissions.map(p => p.permission);
  }

  async descativeRolePermission(id: number): Promise<void> {
    await this.rolePermissionRepository.update(id, { status: 0 });
  }
}