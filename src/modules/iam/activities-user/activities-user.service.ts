// activities-user.service.ts
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  DataSource,
  FindOptionsWhere,
  In,
  IsNull,
  LessThanOrEqual,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';
import { ActivitiesUser } from './entities/activities-user.entity';
import { User } from '../user/entities/user.entity';
import { getCurrentTenantId } from 'src/core/tenant/tenant.context';
import {
  Employee,
  EmployeeStatus,
} from 'src/modules/agencies/employee/entities/employee.entity';
import { UserRole } from 'src/core/enums/user-role.enum';
import { MainGateway } from 'src/core/shared/services/socket/main.gateway';

export interface AuditEntry {
  tenantId?: number | null;
  userId?: number | null;
  action: string;
  resource?: string | null;
  resourceId?: string | null;
  resourceName?: string | null;
  resourceUrl?: string | null;
  details?: Record<string, unknown> | null;
  method?: string | null;
  path?: string | null;
  statusCode?: number | null;
  ip?: string | null;
  summary?: string | null;
  authorizationResult?: 'allowed' | 'denied' | 'not_required' | null;
  requiredPermissions?: string[] | null;
  grantedPermissions?: string[] | null;
  riskLevel?: 'none' | 'low' | 'medium' | 'high' | 'critical';
  errorMessage?: string | null;
}

export interface AuditFilter {
  userId?: number;
  action?: string;
  resource?: string;
  authorizationResult?: string;
  riskLevel?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class ActivitiesUserService {
  private readonly logger = new Logger(ActivitiesUserService.name);

  constructor(
    @InjectRepository(ActivitiesUser)
    private activitiesRepository: Repository<ActivitiesUser>,
    private readonly dataSource: DataSource,
    private readonly mainGateway: MainGateway,
  ) {}

  /**
   * Enregistre une entrée d'audit. Best-effort : ne lève jamais (l'audit ne
   * doit pas faire échouer la requête métier).
   */
  async record(entry: AuditEntry): Promise<void> {
    try {
      const row = this.activitiesRepository.create({
        tenant_id: entry.tenantId ?? getCurrentTenantId(),
        typeActivities: entry.action,
        action: entry.action,
        resource: entry.resource ?? null,
        resource_id: entry.resourceId ?? null,
        resource_name: entry.resourceName?.slice(0, 255) ?? null,
        resource_url: entry.resourceUrl?.slice(0, 500) ?? null,
        event_details: entry.details ?? null,
        method: entry.method ?? null,
        path: entry.path ?? null,
        status_code: entry.statusCode ?? null,
        ip: entry.ip ?? null,
        summary: entry.summary ?? null,
        authorization_result: entry.authorizationResult ?? null,
        required_permissions: entry.requiredPermissions ?? null,
        granted_permissions: entry.grantedPermissions ?? null,
        risk_level: entry.riskLevel ?? 'none',
        error_message: entry.errorMessage?.slice(0, 255) ?? null,
        user: entry.userId ? ({ id: entry.userId } as User) : undefined,
      });
      await this.activitiesRepository.save(row);
    } catch (e: any) {
      this.logger.warn(`[Audit] enregistrement ignoré: ${e?.message ?? e}`);
    }
  }

  /** Liste paginée du journal d'audit du cabinet courant (filtres facultatifs). */
  async findPaginated(filter: AuditFilter): Promise<{
    items: ActivitiesUser[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = Math.max(1, Number(filter.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(filter.limit) || 20));

    const where: FindOptionsWhere<ActivitiesUser> = {
      tenant_id: getCurrentTenantId(),
    };
    if (filter.userId) where.user = { id: filter.userId } as User;
    if (filter.action) where.action = filter.action;
    if (filter.resource) where.resource = filter.resource;
    if (filter.authorizationResult === 'legacy') {
      where.authorization_result = IsNull();
    } else if (filter.authorizationResult) {
      where.authorization_result = filter.authorizationResult as any;
    }
    if (filter.riskLevel === 'risky') {
      where.risk_level = In(['medium', 'high', 'critical']);
    } else if (filter.riskLevel) {
      where.risk_level = filter.riskLevel as any;
    }
    if (filter.from && filter.to) {
      where.created_at = Between(
        new Date(`${filter.from}T00:00:00.000`),
        new Date(`${filter.to}T23:59:59.999`),
      ) as any;
    } else if (filter.from) {
      where.created_at = MoreThanOrEqual(new Date(`${filter.from}T00:00:00.000`)) as any;
    } else if (filter.to) {
      where.created_at = LessThanOrEqual(new Date(`${filter.to}T23:59:59.999`)) as any;
    }

    const [items, total] = await this.activitiesRepository.findAndCount({
      where,
      relations: ['user', 'user.employee'],
      order: { created_at: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, total, page, limit };
  }

  async getUserActivities(userId: number): Promise<ActivitiesUser[]> {
    return this.activitiesRepository.find({
      where: {
        tenant_id: getCurrentTenantId(),
        user: { id: userId },
      },
      relations: ['user', 'user.employee'],
      order: { created_at: 'DESC' },
      take: 100,
    });
  }

  async getSupervision(limit = 40): Promise<{
    metrics: Record<string, number>;
    members: Array<Record<string, unknown>>;
    recent_activity: ActivitiesUser[];
    risky_activity: ActivitiesUser[];
  }> {
    const tenantId = getCurrentTenantId();
    const take = Math.min(100, Math.max(10, Number(limit) || 40));
    const users = await this.dataSource
      .getRepository(User)
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.employee', 'employee')
      .leftJoinAndSelect('employee.branch', 'branch')
      .where('user.tenant_id = :tenantId', { tenantId })
      .orderBy('user.lastSeen', 'DESC')
      .getMany();

    const [recentActivity, riskyActivity, loginRows, riskyCount] = await Promise.all([
      this.activitiesRepository.find({
        where: { tenant_id: tenantId },
        relations: ['user', 'user.employee'],
        order: { created_at: 'DESC' },
        take,
      }),
      this.activitiesRepository.find({
        where: {
          tenant_id: tenantId,
          risk_level: In(['medium', 'high', 'critical']),
        },
        relations: ['user', 'user.employee'],
        order: { created_at: 'DESC' },
        take,
      }),
      this.activitiesRepository.find({
        where: { tenant_id: tenantId, action: 'login' },
        relations: ['user'],
        order: { created_at: 'DESC' },
        take: 500,
      }),
      this.activitiesRepository.count({
        where: {
          tenant_id: tenantId,
          risk_level: In(['medium', 'high', 'critical']),
        },
      }),
    ]);

    const lastLoginByUser = new Map<number, Date>();
    loginRows.forEach((row) => {
      const id = row.user?.id;
      if (id && !lastLoginByUser.has(id)) lastLoginByUser.set(id, row.created_at);
    });
    const onlineUserIds = new Set(this.mainGateway.getOnlineUserIds());
    const members = users.map((user) => ({
      id: user.id,
      first_name: user.first_name,
      last_name: user.last_name,
      email: user.email,
      role: user.role,
      position: user.employee?.position ?? null,
      employee_number: user.employee?.employee_number ?? null,
      professional_phone: user.employee?.professional_phone ?? null,
      branch_name: user.employee?.branch?.name ?? null,
      detail_url: user.employee
        ? `/gestion-cabinet/employees/${user.employee.id}`
        : null,
      is_online: onlineUserIds.has(user.id),
      last_seen: user.lastSeen,
      last_login_at: lastLoginByUser.get(user.id) ?? null,
      is_blocked:
        user.status !== 1 ||
        user.employee?.status === EmployeeStatus.SUSPENDED ||
        user.employee?.status === EmployeeStatus.INACTIVE,
    }));

    return {
      metrics: {
        members: members.length,
        online: members.filter((member) => member.is_online && !member.is_blocked).length,
        blocked: members.filter((member) => member.is_blocked).length,
        risky: riskyCount,
      },
      members,
      recent_activity: recentActivity,
      risky_activity: riskyActivity,
    };
  }

  async setMemberBlocked(
    userId: number,
    blocked: boolean,
    actorUserId: number,
  ): Promise<{ id: number; is_blocked: boolean }> {
    if (userId === actorUserId && blocked) {
      throw new BadRequestException('Vous ne pouvez pas bloquer votre propre compte');
    }
    const tenantId = getCurrentTenantId();
    await this.dataSource.transaction(async (manager) => {
      const users = manager.getRepository(User);
      const user = await users.findOne({
        where: { id: userId, tenant_id: tenantId },
        relations: ['employee'],
      });
      if (!user) throw new NotFoundException('Membre introuvable dans ce cabinet');
      if (blocked && user.role === UserRole.ADMIN) {
        const activeAdmins = await users.count({
          where: { tenant_id: tenantId, role: user.role, status: 1 },
        });
        if (activeAdmins <= 1) {
          throw new BadRequestException('Le dernier administrateur actif ne peut pas être bloqué');
        }
      }

      user.status = blocked ? 0 : 1;
      user.is_online = false;
      user.refreshToken = null as any;
      await users.save(user);
      const employees = manager.getRepository(Employee);
      const employee = await employees.findOne({
        where: { id: userId, tenant_id: tenantId },
      });
      if (employee) {
        employee.status = blocked
          ? EmployeeStatus.SUSPENDED
          : EmployeeStatus.ACTIVE;
        await employees.save(employee);
      }
    });
    if (blocked) this.mainGateway.disconnectUser(userId);
    return { id: userId, is_blocked: blocked };
  }
}
