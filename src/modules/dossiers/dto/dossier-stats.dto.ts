// src/modules/dossiers/dto/dossier-stats.dto.ts
import { BaseStatsDto, DistributionItem } from "src/core/types/base-stats.dto";

export class DossierStatsDto extends BaseStatsDto {
  // Vue d'ensemble
  activeDossiers: number;
  closedDossiers: number;
  archivedDossiers: number;
  
  // Distributions
  byStatus: DistributionItem[];
  byDangerLevel: DistributionItem[];
  byPriority: DistributionItem[];
  byProcedureType: DistributionItem[];
  byJurisdiction: DistributionItem[];
  byLawyer?: DistributionItem[];
  
  // Métriques financières
  financialStats: FinancialStatsDto;
  
  // Métriques temporelles
  timelineStats: TimelineStatsDto;
  
  // Listes
  recentDossiers: RecentDossierDto[];
  urgentDossiers: UrgentDossierDto[];
}

export class FinancialStatsDto {
  totalBudgetEstimate: number;
  totalActualCosts: number;
  averageBudgetPerDossier: number;
  averageCostPerDossier: number;
  budgetVsActual: number;
  byStatus: FinancialByStatusDto[];
}

export class FinancialByStatusDto {
  status: string;
  budgetEstimate: number;
  actualCosts: number;
  difference: number;
}

export class TimelineStatsDto {
  averageDuration: number;
  shortestDuration: number;
  longestDuration: number;
  byProcedureType: TimelineByProcedureDto[];
  openingTrend: MonthlyTrendDto[];
  closingTrend: MonthlyTrendDto[];
}

export class TimelineByProcedureDto {
  procedureType: string;
  averageDuration: number;
  count: number;
}

export class MonthlyTrendDto {
  month: string;
  count: number;
}

export class RecentDossierDto {
  id: number;
  dossierNumber: string;
  object: string;
  clientName: string;
  status: number;
  dangerLevel: number;
  openingDate: Date;
  lawyerName: string;
}

export class UrgentDossierDto {
  id: number;
  dossierNumber: string;
  object: string;
  clientName: string;
  dangerLevel: number;
  priorityLevel: number;
  nextAudience?: Date;
  daysUntilDeadline?: number;
}





