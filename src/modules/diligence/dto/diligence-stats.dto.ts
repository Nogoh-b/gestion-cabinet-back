// src/modules/diligences/dto/diligence-stats.dto.ts

import { BaseStatsDto, DistributionItem } from "src/core/types/base-stats.dto";

export class DiligenceStatsDto extends BaseStatsDto {
  // Vue d'ensemble
  inProgress: number;
  completed: number;
  overdue: number;
  cancelled: number;
  
  // Distributions
  byType: DistributionItem[];
  byPriority: DistributionItem[];
  byStatus: DistributionItem[];
  byLawyer: DiligenceLawyerStatsDto[];
  byDossier: DistributionItem[];
  
  // Métriques de performance
  performance: DiligencePerformanceDto;
  
  // Échéances
  upcomingDeadlines: UpcomingDeadlineDto[];
  expiredDeadlines: ExpiredDeadlineDto[];
  
  // Statistiques temporelles
  completionTrend: CompletionTrendDto[];
  averageCompletionTimeByType: AverageTimeByTypeDto[];
}

export class DiligenceLawyerStatsDto {
  lawyerId: number;
  lawyerName: string;
  total: number;
  inProgress: number;
  completed: number;
  overdue: number;
  onTimeRate: number;
  averageCompletionTime: number;
}

export class DiligencePerformanceDto {
  averageCompletionTime: number; // en jours
  onTimeRate: number; // % terminées dans les délais
  averageProgress: number; // % de progression moyen
  totalHoursBudgeted: number;
  totalHoursSpent: number;
  hoursVariance: number;
}

export class UpcomingDeadlineDto {
  id: number;
  title: string;
  dossierNumber: string;
  clientName: string;
  lawyerName: string;
  deadline: Date;
  daysRemaining: number;
  priority: string;
  progress: number;
}

export class ExpiredDeadlineDto {
  id: number;
  title: string;
  dossierNumber: string;
  clientName: string;
  lawyerName: string;
  deadline: Date;
  daysOverdue: number;
  priority: string;
}

export class CompletionTrendDto {
  month: string;
  completed: number;
  averageTime: number;
  onTimeRate: number;
}

export class AverageTimeByTypeDto {
  type: string;
  averageTime: number;
  count: number;
}