// user-roles.service.ts
import { Injectable, ConflictException, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateUserRoleDto } from './dto/create-user-role.dto';
import { UserRole } from './entities/user-role.entity';
import { RolePermissionService } from '../role-permission/role-permission.service';
import { validateDto } from 'src/core/shared/pipes/validate-dto';
import { CreateRolePermissionDto } from '../role-permission/dto/create-role-permission.dto';
import { RoleResponseDto } from './dto/role-response.dto';
import { plainToInstance } from 'class-transformer';

@Injectable()
export class UserRolesService {
  constructor(
    @InjectRepository(UserRole)
    private repository: Repository<UserRole>,
    @Inject(forwardRef(() => RolePermissionService))
    private readonly rolepermissionService: RolePermissionService,
  ) {
    console.log(forwardRef)
    
  }

  async create(dto: CreateUserRoleDto): Promise<RoleResponseDto> {
    const exists = await this.repository.findOne({ where: { code: dto.code } });
    if (exists) throw new ConflictException('Le role existe deja');
    validateDto(CreateUserRoleDto, dto)
    dto.status = 1
    const userRole = await  this.repository.save(dto);
    const rolePermissionDto = new CreateRolePermissionDto()
    const permission_ids = dto.permissions_ids
    if(permission_ids){
      rolePermissionDto.role_id = userRole.id
      rolePermissionDto.permissions_ids = dto.permissions_ids
      userRole.permissions = await this.rolepermissionService.createRolesPermissions(rolePermissionDto);
    }

    return plainToInstance(RoleResponseDto,this.findOne(userRole.id)) ;
  }

  findAll(): Promise<UserRole[]> {
    return this.repository.find({ relations: ['permissions'] });
  }

  async getPermissionsByCode(code:string){
    const role = await this.repository.findOneBy({ code });
    return await this.rolepermissionService.getRolePermissions(role!.id);
  }
    

  async findOne(id: number): Promise<UserRole> {
    const role = await this.repository.findOne({
      where: { id },
      relations: ['permissions'],
    });
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
      'permission.create_at',
      'permission.update_at'
    ])
    .getRawMany()
    .then(results => 
      results.map(r => ({
        id: r.permission_id,
        code: r.permission_code,
        description: r.permission_description,
        status: r.permission_status,
        create_at: r.permission_create_at,
        update_at: r.permission_update_at
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
      'permission.create_at AS permission_create_at',
      'permission.update_at AS permission_update_at'
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
      create_at: row.permission_create_at,
      update_at: row.permission_update_at
    };

    const roleEntry = roleMap.get(row.role_id);
    if (roleEntry) {
      roleEntry.permissions.push(permission);
    }
  }

  return Array.from(roleMap.values());
}

}