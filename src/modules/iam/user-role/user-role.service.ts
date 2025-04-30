// user-roles.service.ts
import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateUserRoleDto } from './dto/create-user-role.dto';
import { UserRole } from './entities/user-role.entity';

@Injectable()
export class UserRolesService {
  constructor(
    @InjectRepository(UserRole)
    private repository: Repository<UserRole>,
  ) {}

  async create(dto: CreateUserRoleDto): Promise<UserRole> {
    const exists = await this.repository.findOne({ where: { code: dto.code } });
    if (exists) throw new ConflictException('Role code already exists');
    
    return this.repository.save(dto);
  }

  findAll(): Promise<UserRole[]> {
    return this.repository.find();
  }

  async findOne(id: number): Promise<UserRole> {
    const role = await this.repository.findOne({ where: { id } });
    if (!role) throw new NotFoundException('Role not found');
    return role;
  }

  async remove(id: number): Promise<void> {
    await this.repository.delete(id);
  }

async findOneWithPermissions(id: number): Promise<any> {
  const role = await this.repository.findOne({where: {id}})
  const permissions = await this.repository
    .createQueryBuilder('role')
    .leftJoinAndSelect('role.rolePermissions', 'rolePermissions')
    .leftJoinAndSelect('rolePermissions.permission', 'permission')
    .where('role.id = :id', { id })
    .select([
      'permission.id',
      'permission.code',
      'permission.description',
      'permission.status',
      'permission.createdAt',
      'permission.updatedAt'
    ])
    .getRawMany()
    .then(results => 
      results.map(r => ({
        id: r.permission_id,
        code: r.permission_code,
        description: r.permission_description,
        status: r.permission_status,
        createdAt: r.permission_createdAt,
        updatedAt: r.permission_updatedAt
      }))
    );
    let data: any = role
    data.permissions = permissions;
    return data
}

async findAllWithPermissions(): Promise<any[]> {
  const roles = await this.repository.find();

  const permissionsByRole = await this.repository
    .createQueryBuilder('role')
    .leftJoinAndSelect('role.rolePermissions', 'rolePermissions')
    .leftJoinAndSelect('rolePermissions.permission', 'permission')
    .select([
      'role.id AS role_id',
      'permission.id AS permission_id',
      'permission.code AS permission_code',
      'permission.description AS permission_description',
      'permission.status AS permission_status',
      'permission.createdAt AS permission_createdAt',
      'permission.updatedAt AS permission_updatedAt'
    ])
    .getRawMany();

  // Grouper les permissions par rôle
  const roleMap = new Map<number, any>();

  for (const role of roles) {
    roleMap.set(role.id, { ...role, permissions: [] });
  }

  for (const row of permissionsByRole) {
    const permission = {
      id: row.permission_id,
      code: row.permission_code,
      description: row.permission_description,
      status: row.permission_status,
      createdAt: row.permission_createdAt,
      updatedAt: row.permission_updatedAt
    };

    const roleEntry = roleMap.get(row.role_id);
    if (roleEntry) {
      roleEntry.permissions.push(permission);
    }
  }

  return Array.from(roleMap.values());
}

}