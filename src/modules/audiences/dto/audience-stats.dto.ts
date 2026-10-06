// src/modules/audiences/dto/audience-stats.dto.ts

import { BaseStatsDto, DistributionItem } from 'src/core/types/base-stats.dto';

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
  /**
   * Volumétrie réelle des audiences à venir : la liste ci-dessus est plafonnée,
   * ce total alimente l'indicateur « voir tout » du tableau de bord.
   */
  upcomingAudiencesTotal: number;
  pastAudiences: PastAudienceStatsDto;
  monthlyTrend: MonthlyAudienceTrendDto[];
  weeklyDistribution: WeeklyDistributionDto[];
}

export class UpcomingAudienceDto {
  id: number;
  title?: string;
  /** DATE hydratée par le driver MySQL : chaîne 'YYYY-MM-DD'. */
  date: Date | string;
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
