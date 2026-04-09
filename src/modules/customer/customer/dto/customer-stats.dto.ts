// src/modules/customer/customer/dto/customer-stats.dto.ts

import { BaseStatsDto, DistributionItem } from "src/core/types/base-stats.dto";

export class CustomerStatsDto extends BaseStatsDto {
  // Vue d'ensemble
  active: number;
  inactive: number;
  blocked: number;
  
  particuliers: number;
  professionnels: number;
  entreprises: number;
  
  // Distributions
  byType: DistributionItem[];
  byStatus: DistributionItem[];
  byCity: DistributionItem[];
  byBranch: DistributionItem[];
  
  // Statistiques dossiers
  dossierStats: CustomerDossierStatsDto;
  
  // Statistiques financières
  financialStats: CustomerFinancialStatsDto;
  
  // Nouveaux clients
  newCustomersTrend: NewCustomersTrendDto[];
  
  // Top clients
  topClients: TopClientDto[];
  
  // Clients récents
  recentCustomers: RecentCustomerDto[];
  
  // Clients sans dossier
  customersWithoutDossier: CustomerWithoutDossierDto[];
}

export class CustomerDossierStatsDto {
  totalDossiers: number;
  averageDossiersPerCustomer: number;
  customersWithDossiers: number;
  customersWithoutDossiers: number;
  byDossierCount: DossierCountDistributionDto[];
}

export class DossierCountDistributionDto {
  range: string;
  count: number;
  percentage: number;
}

export class CustomerFinancialStatsDto {
  totalFactures: number;
  totalMontantFactures: number;
  totalPaye: number;
  totalImpaye: number;
  averagePerCustomer: number;
  topSpenders: TopSpenderDto[];
}

export class TopSpenderDto {
  customerId: number;
  customerName: string;
  totalFactures: number;
  montantTotal: number;
  montantPaye: number;
  dossierCount: number;
}

export class NewCustomersTrendDto {
  month: string;
  particuliers: number;
  professionnels: number;
  entreprises: number;
  total: number;
}

export class TopClientDto {
  id: number;
  name: string;
  type: string;
  dossierCount: number;
  factureCount: number;
  montantTotal: number;
  montantPaye: number;
  lastActivity: Date;
}

export class RecentCustomerDto {
  id: number;
  name: string;
  type: string;
  email: string;
  phone: string;
  city: string;
  createdAt: Date;
  dossierCount: number;
}

export class CustomerWithoutDossierDto {
  id: number;
  name: string;
  type: string;
  email: string;
  phone: string;
  city: string;
  createdAt: Date;
  daysSinceCreation: number;
}