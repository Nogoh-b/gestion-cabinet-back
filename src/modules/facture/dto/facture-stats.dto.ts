// src/modules/factures/dto/facture-stats.dto.ts

import { BaseStatsDto, DistributionItem } from "src/core/types/base-stats.dto";

export class FactureStatsDto extends BaseStatsDto {
  // Vue d'ensemble
  totalHT: number;
  totalTTC: number;
  totalPaid: number;
  totalUnpaid: number;
  paidCount: number;
  unpaidCount: number;
  overdueCount: number;
  
  // Distributions
  byStatus: DistributionItem[];
  byType: DistributionItem[];
  byClient: DistributionItem[];
  byDossier: DistributionItem[];
  
  // Statistiques financières
  financialSummary: FinancialSummaryDto;
  
  // Statistiques de retard
  overdueStats: OverdueStatsDto;
  
  // Tendances
  monthlyRevenue: MonthlyRevenueDto[];
  
  // Factures récentes
  recentInvoices: RecentInvoiceDto[];
  
  // Factures impayées
  unpaidInvoices: UnpaidInvoiceDto[];
}

export class FinancialSummaryDto {
  totalHT: number;
  totalTTC: number;
  totalPaid: number;
  totalUnpaid: number;
  recoveryRate: number; // % de recouvrement
  averageInvoiceAmount: number;
  largestInvoice: {
    id: string;
    numero: string;
    montantTTC: number;
    client: string;
  };
}

export class OverdueStatsDto {
  count: number;
  totalAmount: number;
  averageDelay: number;
  maxDelay: number;
  byDelayRange: DelayRangeDto[];
}

export class DelayRangeDto {
  range: string;
  count: number;
  totalAmount: number;
}

export class MonthlyRevenueDto {
  month: string;
  totalHT: number;
  totalTTC: number;
  totalPaid: number;
  count: number;
}

export class RecentInvoiceDto {
  id: string;
  numero: string;
  clientName: string;
  dossierNumber: string;
  dateFacture: Date;
  montantTTC: number;
  status: string;
  isPaid: boolean;
  isOverdue: boolean;
}

export class UnpaidInvoiceDto {
  id: string;
  numero: string;
  clientName: string;
  dossierNumber: string;
  dateFacture: Date;
  dateEcheance: Date;
  montantTTC: number;
  resteAPayer: number;
  joursRetard: number;
}