// src/modules/dashboard/services/dashboard.service.ts
import { Injectable } from '@nestjs/common';
import { AudienceStatsService } from '../audiences/audience-stats.service';
import { DiligenceStatsService } from '../diligence/diligence-stats.service';
import { DossierStatsService } from '../dossiers/dossier-stats.service';
import { DocumentStatsService } from '../documents/document-customer/document-stats.service';
import { FactureStatsService } from '../facture/facture-stats.service';
import { CustomerStatsService } from '../customer/customer/customer-stats.service';
import { EmployeeStatsService } from '../agencies/employee/employee-stats.service';
import { DashboardOverviewDto } from './dto/dashboard-overview.dto';


@Injectable()
export class DashboardService {
  constructor(
    private dossierStatsService: DossierStatsService,
    private audienceStatsService: AudienceStatsService,
    private diligenceStatsService: DiligenceStatsService,
    private documentStatsService: DocumentStatsService,
    private factureStatsService: FactureStatsService,
    private customerStatsService: CustomerStatsService,
    private employeeStatsService: EmployeeStatsService,
  ) {}

  async getOverview(): Promise<DashboardOverviewDto> {
    // Lancer toutes les requêtes en parallèle
    const [
      dossiers,
      audiences,
      diligences,
      documents,
      factures,
      clients,
      employes,
    ] = await Promise.all([
      this.dossierStatsService.getStats().catch(() => null),
      this.audienceStatsService.getStats().catch(() => null),
      this.diligenceStatsService.getStats().catch(() => null),
      this.documentStatsService.getStats().catch(() => null),
      this.factureStatsService.getStats().catch(() => null),
      this.customerStatsService.getStats().catch(() => null),
      this.employeeStatsService.getStats().catch(() => null),
    ]);

    return {
      summary: this.buildSummary({
        dossiers, audiences, diligences, documents, factures, clients, employes
      }),
      alerts: this.buildAlerts({
        dossiers, diligences, factures, documents, audiences
      }),
      byStatus: this.buildByStatus({
        dossiers, audiences, diligences
      }),
      trends: await this.buildTrends({
        dossiers, audiences, factures
      }),
      recentActivity: this.buildRecentActivity({
        dossiers, audiences, diligences, documents, factures
      }),
      topPerformers: this.buildTopPerformers(employes),
      financial: this.buildFinancial(factures),
    };
  }

  private buildSummary(data: any): DashboardOverviewDto['summary'] {
    return {
      totalDossiers: data.dossiers?.total || 0,
      totalAudiences: data.audiences?.total || 0,
      totalDiligences: data.diligences?.total || 0,
      totalDocuments: data.documents?.total || 0,
      totalFactures: data.factures?.total || 0,
      totalClients: data.clients?.total || 0,
      totalEmployes: data.employes?.total || 0,
    };
  }

  private buildAlerts(data: any): DashboardOverviewDto['alerts'] {
    return {
      dossiersUrgents: data.dossiers?.urgentDossiers?.length || 0,
      diligencesEnRetard: data.diligences?.overdue || 0,
      facturesImpayees: data.factures?.unpaidCount || 0,
      documentsEnAttente: data.documents?.pendingValidation || 0,
      audiencesAJour: data.audiences?.upcomingAudiences?.length || 0,
    };
  }

  private buildByStatus(data: any): DashboardOverviewDto['byStatus'] {
    return {
      dossiers: data.dossiers?.byStatus || [],
      audiences: data.audiences?.byStatus || [],
      diligences: data.diligences?.byStatus || [],
    };
  }

  private async buildTrends(data: any): Promise<DashboardOverviewDto['trends']> {
    return {
      dossiers: (data.dossiers?.evolution || []).slice(-30),
      audiences: (data.audiences?.evolution || []).slice(-30),
      factures: (data.factures?.monthlyRevenue || []).slice(-6).map((m: any) => ({
        month: m.month,
        totalTTC: parseFloat(m.totalTTC || 0),
        totalHT: parseFloat(m.totalHT || 0),
        totalPaid: parseFloat(m.totalPaid || 0),
      })),
    };
  }

  private buildRecentActivity(data: any): DashboardOverviewDto['recentActivity'] {
    const activities : any = [];

    // Ajouter les dossiers récents
    if (data.dossiers?.recentDossiers) {
      data.dossiers.recentDossiers.slice(0, 3).forEach((d: any) => {
        activities.push({
          id: `dossier-${d.id}`,
          type: 'dossier',
          title: `Nouveau dossier ${d.dossierNumber}`,
          description: d.clientName,
          date: d.openingDate,
          status: this.getDossierStatusLabel(d.status),
          link: `/dossiers/${d.id}`,
        });
      });
    }

    // Ajouter les audiences à venir
    if (data.audiences?.upcomingAudiences) {
      data.audiences.upcomingAudiences.slice(0, 3).forEach((a: any) => {
        activities.push({
          id: `audience-${a.id}`,
          type: 'audience',
          title: `Audience: ${a.title}`,
          description: `${a.dossierNumber} - ${a.jurisdiction}`,
          date: a.date,
          status: 'Planifiée',
          link: `/audiences/${a.id}`,
        });
      });
    }

    // Ajouter les échéances de diligences
    if (data.diligences?.upcomingDeadlines) {
      data.diligences.upcomingDeadlines.slice(0, 3).forEach((d: any) => {
        activities.push({
          id: `diligence-${d.id}`,
          type: 'diligence',
          title: `Échéance: ${d.title}`,
          description: d.dossierNumber,
          date: d.deadline,
          status: `${d.daysRemaining} jours restants`,
          link: `/diligences/${d.id}`,
        });
      });
    }

    // Ajouter les documents récents
    if (data.documents?.recentDocuments) {
      data.documents.recentDocuments.slice(0, 3).forEach((d: any) => {
        activities.push({
          id: `document-${d.id}`,
          type: 'document',
          title: `Document: ${d.name}`,
          description: d.dossierNumber,
          date: d.uploadedAt,
          status: this.getDocumentStatusLabel(d.status),
          link: `/documents/${d.id}`,
        });
      });
    }

    // Ajouter les factures récentes
    if (data.factures?.recentInvoices) {
      data.factures.recentInvoices.slice(0, 3).forEach((f: any) => {
        activities.push({
          id: `facture-${f.id}`,
          type: 'facture',
          title: `Facture ${f.numero}`,
          description: f.clientName,
          date: f.dateFacture,
          status: f.isPaid ? 'Payée' : f.isOverdue ? 'En retard' : 'En attente',
          link: `/factures/${f.id}`,
        });
      });
    }

    // Trier par date (plus récent d'abord)
    return activities
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 10);
  }

  private buildTopPerformers(employes: any): DashboardOverviewDto['topPerformers'] {
    if (!employes?.topPerformers) return [];

    return employes.topPerformers.slice(0, 5).map((p: any) => ({
      id: p.id,
      name: p.name,
      position: p.position,
      dossiers: p.dossiers || p.totalDossiers || 0,
      successRate: p.successRate || p.tauxSucces || 0,
    }));
  }

  private buildFinancial(factures: any): DashboardOverviewDto['financial'] {
    if (!factures) {
      return {
        totalFacture: 0,
        totalPaye: 0,
        totalImpaye: 0,
        tauxRecouvrement: 0,
        facturesEnRetard: 0,
      };
    }

    return {
      totalFacture: factures.totalTTC || 0,
      totalPaye: factures.totalPaid || 0,
      totalImpaye: factures.totalUnpaid || 0,
      tauxRecouvrement: factures.financialSummary?.recoveryRate || 0,
      facturesEnRetard: factures.overdueCount || 0,
    };
  }

  private getDossierStatusLabel(status: number): string {
    const labels: Record<number, string> = {
      0: 'Ouvert',
      1: 'Amiable',
      2: 'Contentieux',
      3: 'Décision',
      4: 'Recours',
      5: 'Clôturé',
      6: 'Archivé',
    };
    return labels[status] || 'Inconnu';
  }

  private getDocumentStatusLabel(status: number): string {
    const labels: Record<number, string> = {
      0: 'En attente',
      1: 'Validé',
      2: 'Rejeté',
      3: 'Expiré',
      4: 'Archivé',
    };
    return labels[status] || 'Inconnu';
  }
}