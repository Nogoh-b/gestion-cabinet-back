// src/modules/stats/dto/base-stats.dto.ts
export class BaseStatsDto {
  total: number;
  evolution?: EvolutionData[];
}

export class EvolutionData {
  date: string;
  count: number;
  cumulative?: number;
  period?: 'day' | 'week' | 'month';
}

export class DistributionItem {
  name: string;
  value: number;
  percentage: number;
  color?: string;
  id?: number | string;
  code?: string;
}

export class DateRangeDto {
  startDate?: Date;
  endDate?: Date;
  fieldToUseForDate?: string;
}

export class StatsFilterDto extends DateRangeDto {
  dossierId?: number; // 👈 Ajouter cette ligne
  [key: string]: any;
}