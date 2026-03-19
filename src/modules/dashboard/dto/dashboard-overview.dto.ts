// src/modules/dashboard/dto/dashboard-overview.dto.ts
export class DashboardOverviewDto {
  // Résumé global - correspond à OverviewCards
  summary: {
    totalDossiers: number;
    totalAudiences: number;
    totalDiligences: number;
    totalDocuments: number;
    totalFactures: number;
    totalClients: number;
    totalEmployes: number;
  };

  // Alertes et urgences - correspond à AlertsNotifications
  alerts: {
    dossiersUrgents: number;
    diligencesEnRetard: number;
    facturesImpayees: number;
    documentsEnAttente: number;
    audiencesAJour: number;
  };

  // Statistiques par statut - pour les graphiques
  byStatus: {
    dossiers: Array<{ name: string; value: number; color?: string }>;
    audiences: Array<{ name: string; value: number; color?: string }>;
    diligences: Array<{ name: string; value: number; color?: string }>;
  };

  // Tendances (évolution) - pour PerformanceCharts
  trends: {
    dossiers: Array<{ date: string; count: number }>;
    audiences: Array<{ date: string; count: number }>;
    factures: Array<{ month: string; totalTTC: number; totalHT: number; totalPaid: number }>;
  };

  // Activité récente - pour RecentActivity
  recentActivity: Array<{
    id: string;
    type: 'dossier' | 'audience' | 'diligence' | 'document' | 'facture';
    title: string;
    description: string;
    date: Date;
    status?: string;
    link?: string;
  }>;

  // Top performers - pour PerformanceCharts (onglet équipe)
  topPerformers: Array<{
    id: number;
    name: string;
    position: string;
    dossiers: number;
    successRate: number;
  }>;

  // Résumé financier - pour PerformanceCharts (onglet financier)
  financial: {
    totalFacture: number;
    totalPaye: number;
    totalImpaye: number;
    tauxRecouvrement: number;
    facturesEnRetard: number;
  };
}