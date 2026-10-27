import { getCurrentTenantId } from 'src/core/tenant/tenant.context';
// role-permission.service.ts
import {
  Injectable,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateRolePermissionDto } from './dto/create-role-permission.dto';
import { addTenantCondition } from 'src/core/tenant/tenant-repository.patch';
import { RolePermission } from './entities/role-permission.entity';
import { UserRolesService } from '../user-role/user-role.service';
import { PermissionsService } from '../permission/permission.service';
import { Permission } from '../permission/entities/permission.entity';
import { validateDto } from 'src/core/shared/pipes/validate-dto';
import { isProtectedPermission } from '../constants/iam.constants';

@Injectable()
export class RolePermissionService {
  constructor(
    @InjectRepository(RolePermission)
    private readonly rolePermissionRepository: Repository<RolePermission>,
    @Inject(forwardRef(() => UserRolesService))
    private readonly userRolesService: UserRolesService,
    private readonly permissionsService: PermissionsService,
  ) {}

  async createRolesPermissions(
    createDto: CreateRolePermissionDto,
  ): Promise<any> {
    await validateDto(CreateRolePermissionDto, createDto);
    const role = await this.userRolesService.findOne(createDto.role_id);

    // Validation préalable : aucune liaison n'est créée si une seule
    // permission système (SUPER_ADMIN, AUDIT_SYSTEM…) figure dans la demande.
    const permissions = new Map<number, Permission>();
    for (const element of createDto.permissions_ids) {
      const permission = await this.permissionsService.findOne(element);
      if (isProtectedPermission(permission)) {
        throw new ForbiddenException(
          `La permission système « ${permission.code} » ne peut pas être attribuée.`,
        );
      }
      permissions.set(element, permission);
    }

    for (const element of createDto.permissions_ids) {
      // Ignorer silencieusement les permissions déjà assignées (idempotent)
      const exists = await this.rolePermissionRepository.findOne({
        where: { role_id: createDto.role_id, permission_id: element },
      });
      if (exists) continue;

      const permission = permissions.get(element);
      const rolePermission = this.rolePermissionRepository.create({
        role_id: createDto.role_id,
        permission_id: element,
        status: 1,
      });
      await this.rolePermissionRepository.save({
        ...rolePermission,
        role,
        permission,
      });
    }

    return this.userRolesService.findOne(createDto.role_id);
  }

  async remove(role_id: number, permission_id: number): Promise<void> {
    const result = await this.rolePermissionRepository.delete({
      role_id,
      permission_id,
    });

    if (result.affected === 0) {
      throw new NotFoundException('Association rôle-permission non trouvée');
    }
  }

  async findByRole(role_id: number): Promise<RolePermission[]> {
    return this.rolePermissionRepository.find({
      where: { role_id },
      relations: ['permission', 'role'],
    });
  }

  async getPermissionsByRole(role_id: number): Promise<Permission[]> {
    // Isolation stricte : filtres tenant explicites sur la liaison ET la
    // permission jointe (le QueryBuilder contourne le patch Repository) →
    // jamais de permissions d'un autre cabinet, même via des liaisons
    // résiduelles cross-tenant.
    let qb = addTenantCondition(
      this.rolePermissionRepository
        .createQueryBuilder('rp')
        .innerJoinAndSelect('rp.permission', 'permission')
        .where('rp.role_id = :role_id', { role_id }),
      'rp',
    );
    qb = addTenantCondition(qb, 'permission');
    return qb
      .select([
        'permission.id',
        'permission.code',
        'permission.description',
        'permission.status',
        'permission.created_at',
        'permission.updated_at',
      ])
      .getMany()
      .then((results) => results.map((r) => r.permission));
  }

  async findByPermission(permission_id: number): Promise<RolePermission[]> {
    return this.rolePermissionRepository.find({
      where: { permission_id },
      relations: ['role', 'permission'],
    });
  }

  async getRolePermissions(role_id: number): Promise<Permission[]> {
    // Seules les liaisons actives comptent : une liaison désactivée (status 0)
    // ne doit jamais accorder la permission.
    const tenant=getCurrentTenantId();
    const records=await this.rolePermissionRepository.createQueryBuilder('rp')
      .innerJoinAndSelect('rp.permission','permission','permission.tenant_id=:tenant',{tenant})
      .where('rp.role_id=:role_id AND rp.tenant_id=:tenant AND rp.status=1',{role_id,tenant})
      .andWhere('(permission.status IS NULL OR permission.status <> 0)').getMany();
    return records.map(record=>record.permission);
  }

  async descativeRolePermission(id: number): Promise<void> {
    await this.rolePermissionRepository.update(id, { status: 0 });
  }
}
