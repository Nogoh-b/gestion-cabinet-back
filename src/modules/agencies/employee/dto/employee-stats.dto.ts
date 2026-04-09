// src/modules/agencies/employee/dto/employee-stats.dto.ts

import { BaseStatsDto, DistributionItem } from "src/core/types/base-stats.dto";

export class EmployeeStatsDto extends BaseStatsDto {
  // Vue d'ensemble
  active: number;
  inactive: number;
  onVacation: number;
  
  avocats: number;
  secretaires: number;
  assistants: number;
  stagiaires: number;
  huissiers: number;
  administratifs: number;
  
  // Distributions
  byPosition: DistributionItem[];
  byStatus: DistributionItem[];
  byBranch: DistributionItem[];
  bySpecialization: DistributionItem[];
  
  // Statistiques de charge
  workloadStats: WorkloadStatsDto;
  
  // Statistiques de performance
  performanceStats?: PerformanceStatsDto;
  
  // Nouveaux employés
  newHiresTrend: NewHiresTrendDto[];
  
  // Top performers
  topPerformers: TopPerformerDto[];
  
  // Employés récents
  recentEmployees: RecentEmployeeDto[];
  
  // Employés disponibles
  availableEmployees?: AvailableEmployeeDto[];
}

export class WorkloadStatsDto {
  totalDossiers: number;
  averageDossiersPerEmployee: number;
  maxDossiers: number;
  overloadedEmployees: number; // > 80% de leur capacité
  underloadedEmployees: number; // < 20% de leur capacité
  byLoadRange: LoadRangeDto[];
}

export class LoadRangeDto {
  range: string;
  count: number;
  percentage: number;
  averageLoad: number;
}

export class PerformanceStatsDto {
  averageDossierCompletionTime: number;
  averageDossierSuccessRate: number;
  totalAudiences: number;
  audiencesHeld: number;
  audiencesSuccessRate: number;
  totalDiligences: number;
  diligencesCompleted: number;
  diligencesOnTime: number;
  byPosition: PerformanceByPositionDto[];
}

export class PerformanceByPositionDto {
  position: string;
  employeeCount: number;
  averageDossiers: number;
  averageCompletionTime: number;
  successRate: number;
}

export class NewHiresTrendDto {
  month: string;
  avocats: number;
  secretaires: number;
  assistants: number;
  stagiaires: number;
  total: number;
}

export class TopPerformerDto {
  id: number;
  name: string;
  position: string;
  branch: string;
  dossierCount: number;
  completedDossiers: number;
  successRate: number;
  averageCompletionTime: number;
  audienceCount: number;
  diligenceCount: number;
}

export class RecentEmployeeDto {
  id: number;
  name: string;
  position: string;
  branch: string;
  email: string;
  phone: string;
  hireDate: Date;
  status: string;
  dossierCount: number;
}

export class AvailableEmployeeDto {
  id: number;
  name: string;
  position: string;
  specialization: string;
  branch: string;
  currentDossierCount: number;
  maxDossiers: number;
  availabilityRate: number;
  isAvailable: boolean;
}