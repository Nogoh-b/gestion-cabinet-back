// activities-user.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, FindOptionsWhere, Repository } from 'typeorm';
import { ActivitiesUser } from './entities/activities-user.entity';
import { User } from '../user/entities/user.entity';

export interface AuditEntry {
  userId?: number | null;
  action: string;
  resource?: string | null;
  resourceId?: string | null;
  method?: string | null;
  path?: string | null;
  statusCode?: number | null;
  ip?: string | null;
  summary?: string | null;
}

export interface AuditFilter {
  userId?: number;
  action?: string;
  resource?: string;
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
  ) {}

  /**
   * Enregistre une entrée d'audit. Best-effort : ne lève jamais (l'audit ne
   * doit pas faire échouer la requête métier).
   */
  async record(entry: AuditEntry): Promise<void> {
    try {
      const row = this.activitiesRepository.create({
        typeActivities: entry.action,
        action: entry.action,
        resource: entry.resource ?? null,
        resource_id: entry.resourceId ?? null,
        method: entry.method ?? null,
        path: entry.path ?? null,
        status_code: entry.statusCode ?? null,
        ip: entry.ip ?? null,
        summary: entry.summary ?? null,
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

    const where: FindOptionsWhere<ActivitiesUser> = {};
    if (filter.userId) where.user = { id: filter.userId } as User;
    if (filter.action) where.action = filter.action;
    if (filter.resource) where.resource = filter.resource;
    if (filter.from && filter.to) {
      where.created_at = Between(new Date(filter.from), new Date(filter.to)) as any;
    }

    const [items, total] = await this.activitiesRepository.findAndCount({
      where,
      relations: ['user'],
      order: { created_at: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, total, page, limit };
  }

  async getUserActivities(userId: number): Promise<ActivitiesUser[]> {
    return this.activitiesRepository.find({
      where: { user: { id: userId } },
      relations: ['user'],
      order: { created_at: 'DESC' },
      take: 100,
    });
  }
}
