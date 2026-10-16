import { UserRole as BuiltinRole } from 'src/core/enums/user-role.enum';
import { getCurrentTenantId } from 'src/core/tenant/tenant.context';
// user-roles.service.ts
import {
  Injectable,
  ConflictException,
  NotFoundException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateUserRoleDto } from './dto/create-user-role.dto';
import { UserRole } from './entities/user-role.entity';
import { addTenantCondition } from 'src/core/tenant/tenant-repository.patch';
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
    console.log(forwardRef);
  }

  async create(dto: CreateUserRoleDto): Promise<RoleResponseDto> {
    if (!/^[a-z][a-z0-9_]{0,63}$/.test(dto.code) || ['admin','client'].includes(dto.code)) throw new ConflictException('Code de rôle invalide ou réservé.');
    dto.base_role ??= Object.values(BuiltinRole).includes(dto.code as BuiltinRole) ? dto.code : 'collaborateur';
    dto.isSystemRole = false;
    const exists = await this.repository.findOne({ where: { code: dto.code } });
    if (exists) throw new ConflictException('Le role existe deja');
    validateDto(CreateUserRoleDto, dto);
    dto.status = 1;
    const userRole = await this.repository.save(dto);
    const rolePermissionDto = new CreateRolePermissionDto();
    const permission_ids = dto.permissions_ids;
    if (permission_ids) {
      rolePermissionDto.role_id = userRole.id;
      rolePermissionDto.permissions_ids = dto.permissions_ids;
      userRole.permissions =
        await this.rolepermissionService.createRolesPermissions(
          rolePermissionDto,
        );
    }

    return plainToInstance(RoleResponseDto, this.findOne(userRole.id));
  }

  findActiveByCode(code: string) { return this.repository.createQueryBuilder('r').where('r.code=:code AND r.status=1 AND r.tenant_id=:tenant',{code,tenant:getCurrentTenantId()}).getOne(); }

  findAll(): Promise<UserRole[]> {
    return this.repository.find({ relations: ['permissions'] });
  }

  async getPermissionsByCode(code: string) {
    const role = await this.findActiveByCode(code);
    // Rôle introuvable : aucune permission. Ne JAMAIS retomber sur un autre
    // rôle (l'ancien `role?.id || 1` donnait les droits du rôle d'id 1).
    if (!role) return [];
    return await this.rolepermissionService.getRolePermissions(role.id);
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
    const role = await this.findOne(id);
    if (['admin', 'client'].includes(role.code)) throw new ConflictException('Rôle système protégé.');
    const [usage] = await this.repository.query('SELECT COUNT(*) AS count FROM \x60user\x60 WHERE tenant_id = ? AND role = ?', [getCurrentTenantId(), role.code]);
    if (Number(usage.count)) throw new ConflictException('Réaffectez les utilisateurs avant de retirer ce rôle.');
    await this.repository.delete(id);
  }

  async findOneWithPermissions(id: number): Promise<any> {
    const role = await this.repository.findOne({ where: { id } });
    // Isolation stricte : le QueryBuilder ne passe PAS par le patch
    // Repository → filtres tenant explicites sur le rôle ET les jointures
    // (WHERE *.tenant_id = X), sinon des liaisons résiduelles cross-tenant
    // feraient réapparaître des permissions d'un autre cabinet.
    let qb = addTenantCondition(
      this.repository
        .createQueryBuilder('role')
        .leftJoinAndSelect('role.rolePermissions', 'rolePermissions')
        .leftJoinAndSelect('rolePermissions.permission', 'permission')
        .where('role.id = :id', { id }),
      'role',
    );
    qb = addTenantCondition(qb, 'rolePermissions');
    qb = addTenantCondition(qb, 'permission');
    const permissions = await qb
      .select([
        'permission.id',
        'permission.code',
        'permission.description',
        'permission.status',
        'permission.created_at',
        'permission.updated_at',
      ])
      .getRawMany()
      .then((results) =>
        results.map((r) => ({
          id: r.permission_id,
          code: r.permission_code,
          description: r.permission_description,
          status: r.permission_status,
          created_at: r.permission_created_at,
          updated_at: r.permission_updated_at,
        })),
      );
    const data: any = role;
    data.permissions = permissions;
    return data;
  }

  async findAllWithPermissions(): Promise<any[]> {
    const roles = await this.repository.find();

    // Isolation stricte : filtres tenant explicites sur le rôle ET les
    // jointures (le QueryBuilder contourne le patch Repository) → chaque
    // cabinet ne voit QUE ses propres rôles/permissions, jamais les
    // lignes résiduelles d'un autre tenant.
    let qb = addTenantCondition(
      this.repository
        .createQueryBuilder('role')
        .leftJoinAndSelect('role.rolePermissions', 'rolePermissions')
        .leftJoinAndSelect('rolePermissions.permission', 'permission'),
      'role',
    );
    qb = addTenantCondition(qb, 'rolePermissions');
    qb = addTenantCondition(qb, 'permission');
    const permissionsByRole = await qb.select([
        'role.id AS role_id',
        'permission.id AS permission_id',
        'permission.code AS permission_code',
        'permission.description AS permission_description',
        'permission.status AS permission_status',
        'permission.created_at AS permission_created_at',
        'permission.updated_at AS permission_updated_at',
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
        created_at: row.permission_created_at,
        updated_at: row.permission_updated_at,
      };

      const roleEntry = roleMap.get(row.role_id);
      if (roleEntry) {
        roleEntry.permissions.push(permission);
      }
    }

    return Array.from(roleMap.values());
  }
}
