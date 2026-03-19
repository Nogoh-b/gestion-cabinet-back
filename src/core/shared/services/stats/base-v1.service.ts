// src/modules/stats/services/base-stats.service.ts
import { Repository, SelectQueryBuilder, ObjectLiteral } from 'typeorm';
import { Injectable } from '@nestjs/common';
import { StatsFilterDto } from 'src/core/types/base-stats.dto';

@Injectable()
export abstract class BaseStatsService<T extends ObjectLiteral> {
  constructor(protected repository: Repository<T>) {}

  abstract getStats(filters?: StatsFilterDto): Promise<any>;

  protected applyFilters(
    query: SelectQueryBuilder<T>,
    filters?: StatsFilterDto,
    alias: string = 'entity',
  ): SelectQueryBuilder<T> {
    if (!filters) return query;
    const fieldToUseForDate = filters.fieldToUseForDate ?? 'created_at'
    if (filters.startDate) {
      query.andWhere(`${alias}.${fieldToUseForDate} >= :startDate`, { startDate: filters.startDate });
    }

    if (filters.endDate) {
      query.andWhere(`${alias}.${fieldToUseForDate} <= :endDate`, { endDate: filters.endDate });
    }

    return query;
  }

  protected async getTotalCount(filters?: StatsFilterDto): Promise<number> {
    const query = this.repository.createQueryBuilder('entity');
    this.applyFilters(query, filters);
    return query.getCount();
  }

// src/modules/stats/services/base-stats.service.ts

protected async getEvolution(
  filters?: StatsFilterDto,
  dateField: string = 'created_at',
  alias: string = 'entity' // 👈 Ajouter un paramètre alias
): Promise<any[]> {
  const { startDate = this.getDefaultStartDate(), endDate = new Date() } = filters || {};
  dateField = filters?.fieldToUseForDate ?? dateField;
  
  const query = this.repository
    .createQueryBuilder(alias) // 👈 Utiliser l'alias passé en paramètre
    .select(`DATE(${alias}.${dateField})`, 'date')
    .addSelect('COUNT(*)', 'count')
    .where(`${alias}.${dateField} BETWEEN :start AND :end`, { start: startDate, end: endDate })
    .groupBy(`DATE(${alias}.${dateField})`)
    .orderBy('date', 'ASC');

  this.applyFilters(query, filters, alias); // 👈 Passer l'alias à applyFilters

  const results = await query.getRawMany();
  
  let cumulative = 0;
  return results.map(r => {
    cumulative += parseInt(r.count);
    return {
      date: r.date,
      count: parseInt(r.count),
      cumulative,
    };
  });
}
  protected getDefaultStartDate(): Date {
    const date = new Date();
    date.setMonth(date.getMonth() - 6);
    return date;
  }

  protected calculatePercentage(value: number, total: number): number {
    return total > 0 ? Math.round((value / total) * 100) : 0;
  }
}