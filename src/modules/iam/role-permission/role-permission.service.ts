// role-permission.service.ts
import {
  Injectable,
  ConflictException,
  NotFoundException
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateRolePermissionDto } from './dto/create-role-permission.dto';
import { RolePermission } from './entities/role-permission.entity';
import { UserRolesService } from '../user-role/user-role.service';
import { PermissionsService } from '../permission/permission.service';
import { Permission } from '../permission/entities/permission.entity';

@Injectable()
export class RolePermissionService {
  constructor(
    @InjectRepository(RolePermission)
    private readonly rolePermissionRepository: Repository<RolePermission>,
    private readonly userRolesService: UserRolesService,
    private readonly permissionsService: PermissionsService,
  ) {}

  async create(createDto: CreateRolePermissionDto): Promise<RolePermission> {
    // Vérifier l'existence du rôle et de la permission
    await this.userRolesService.findOne(createDto.role_id);
    await this.permissionsService.findOne(createDto.permission_id);

    // Vérifier si l'association existe déjà
    const exists = await this.rolePermissionRepository.findOne({
      where: {
        role_id: createDto.role_id,
        permission_id: createDto.permission_id
      }
    });

    if (exists) {
      throw new ConflictException('Cette permission est déjà assignée au rôle');
    }

    // Créer la nouvelle association
    const rolePermission = this.rolePermissionRepository.create({
      role_id: createDto.role_id,
      permission_id: createDto.permission_id,
      status: createDto.status ?? 1
    });

    return this.rolePermissionRepository.save(rolePermission);
  }

  async remove(role_id: number, permission_id: number): Promise<void> {
    const result = await this.rolePermissionRepository.delete({
      role_id,
      permission_id
    });
    
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
      'permission.create_at',
      'permission.update_at'
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
}