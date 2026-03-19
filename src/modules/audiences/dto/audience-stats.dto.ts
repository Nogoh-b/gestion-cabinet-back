// src/modules/audiences/dto/audience-stats.dto.ts

import { BaseStatsDto, DistributionItem } from "src/core/types/base-stats.dto";

export class AudienceStatsDto extends BaseStatsDto {
  scheduled: number;
  held: number;
  postponed: number;
  cancelled: number;
  
  byStatus: DistributionItem[];
  byType: DistributionItem[];
  byJurisdiction: DistributionItem[];
  byDossier: DistributionItem[];
  
  upcomingAudiences: UpcomingAudienceDto[];
  pastAudiences: PastAudienceStatsDto;
  monthlyTrend: MonthlyAudienceTrendDto[];
  weeklyDistribution: WeeklyDistributionDto[];
}

export class UpcomingAudienceDto {
  id: number;
  title?: string;
  date: Date;
  jurisdiction: string;
  dossierNumber: string;
  clientName: string;
  status: number;
}

export class PastAudienceStatsDto {
  total: number;
  averageDuration: number;
  successRate: number;
}

export class MonthlyAudienceTrendDto {
  month: string;
  scheduled: number;
  held: number;
}

export class WeeklyDistributionDto {
  dayOfWeek: string;
  count: number;
  percentage: number;
}