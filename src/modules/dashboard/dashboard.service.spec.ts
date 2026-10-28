import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { DashboardService } from './dashboard.service';
import { DossierStatsService } from '../dossiers/dossier-stats.service';
import { AudienceStatsService } from '../audiences/audience-stats.service';
import { DiligenceStatsService } from '../diligence/diligence-stats.service';
import { DocumentStatsService } from '../documents/document-customer/document-stats.service';
import { FactureStatsService } from '../facture/facture-stats.service';
import { CustomerStatsService } from '../customer/customer/customer-stats.service';
import { EmployeeStatsService } from '../agencies/employee/employee-stats.service';
import { DashboardWatchlistService } from './dashboard-watchlist.service';

describe('DashboardService', () => {
  let service: DashboardService;

  const dossierStats = { getStats: jest.fn<() => Promise<any>>() };
  const audienceStats = { getStats: jest.fn<() => Promise<any>>() };
  const diligenceStats = { getStats: jest.fn<() => Promise<any>>() };
  const documentStats = { getStats: jest.fn<() => Promise<any>>() };
  const factureStats = { getStats: jest.fn<() => Promise<any>>() };
  const customerStats = { getStats: jest.fn<() => Promise<any>>() };
  const employeeStats = { getStats: jest.fn<() => Promise<any>>() };
  const watchlist = { countOverdueActions: jest.fn<() => Promise<number>>() };

  beforeEach(async () => {
    watchlist.countOverdueActions.mockResolvedValue(0);
    dossierStats.getStats.mockResolvedValue(null);
    audienceStats.getStats.mockResolvedValue(null);
    diligenceStats.getStats.mockResolvedValue(null);
    documentStats.getStats.mockResolvedValue(null);
    factureStats.getStats.mockResolvedValue(null);
    customerStats.getStats.mockResolvedValue(null);
    employeeStats.getStats.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: DossierStatsService, useValue: dossierStats },
        { provide: AudienceStatsService, useValue: audienceStats },
        { provide: DiligenceStatsService, useValue: diligenceStats },
        { provide: DocumentStatsService, useValue: documentStats },
        { provide: FactureStatsService, useValue: factureStats },
        { provide: CustomerStatsService, useValue: customerStats },
        { provide: EmployeeStatsService, useValue: employeeStats },
        { provide: DashboardWatchlistService, useValue: watchlist },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('expose les actions avocat mappees depuis les stats', async () => {
    diligenceStats.getStats.mockResolvedValue({
      total: 2,
      overdue: 1,
      expiredDeadlines: [
        {
          id: 7,
          title: 'Conclusions en replique',
          dossierNumber: 'DOS-001',
          dossierId: 12,
          sourceActionId: 'action-uuid-1',
          clientName: 'Client A',
          lawyerName: 'Me Dupont',
          deadline: new Date('2026-09-10'),
          daysOverdue: 11,
          priority: 'high',
        },
      ],
      upcomingDeadlines: [
        {
          id: 8,
          title: 'Assignation a signifier',
          dossierNumber: 'DOS-002',
          dossierId: 13,
          sourceActionId: null,
          clientName: 'Client B',
          lawyerName: 'Me Dupont',
          deadline: new Date('2026-09-25'),
          daysRemaining: 4,
          priority: 'critical',
        },
      ],
    });
    audienceStats.getStats.mockResolvedValue({
      total: 1,
      upcomingAudiences: [
        {
          id: 3,
          date: new Date('2026-09-23'),
          jurisdiction: 'TGI Yaounde',
          dossierNumber: 'DOS-001',
          clientName: 'Client A',
          status: 'scheduled',
        },
      ],
    });

    const overview = await service.getOverview();

    expect(overview.actions.diligencesEnRetard).toEqual([
      {
        id: 7,
        title: 'Conclusions en replique',
        dossierNumber: 'DOS-001',
        dossierId: 12,
        sourceActionId: 'action-uuid-1',
        clientName: 'Client A',
        lawyerName: 'Me Dupont',
        deadline: new Date('2026-09-10'),
        daysOverdue: 11,
        priority: 'high',
      },
    ]);
    expect(overview.actions.echeancesProches).toHaveLength(1);
    expect(overview.actions.echeancesProches[0].daysRemaining).toBe(4);
    expect(overview.actions.echeancesProches[0].sourceActionId).toBeNull();
    expect(overview.actions.prochainesAudiences).toEqual([
      {
        id: 3,
        date: new Date('2026-09-23'),
        jurisdiction: 'TGI Yaounde',
        dossierNumber: 'DOS-001',
        clientName: 'Client A',
        status: 'scheduled',
      },
    ]);
  });

  it('retourne des actions vides quand les stats sont indisponibles', async () => {
    const overview = await service.getOverview();

    expect(overview.actions).toEqual({
      totaux: {
        diligencesEnRetard: 0,
        echeancesProches: 0,
        prochainesAudiences: 0,
      },
      diligencesEnRetard: [],
      echeancesProches: [],
      prochainesAudiences: [],
    });
  });

  it('tronque chaque section a 5 elements et expose la volumetrie reelle', async () => {
    const many = (count: number, prefix: string, extra: object = {}) =>
      Array.from({ length: count }, (_, i) => ({
        id: i + 1,
        title: `${prefix} ${i + 1}`,
        dossierNumber: `DOS-${i + 1}`,
        clientName: 'Client',
        lawyerName: 'Me Dupont',
        deadline: new Date('2026-09-10'),
        ...extra,
      }));

    diligenceStats.getStats.mockResolvedValue({
      total: 40,
      overdue: 12,
      expiredDeadlines: many(12, 'Retard', { daysOverdue: 3 }),
      expiredDeadlinesTotal: 12,
      upcomingDeadlines: many(9, 'Echeance', { daysRemaining: 5 }),
      upcomingDeadlinesTotal: 9,
    });
    audienceStats.getStats.mockResolvedValue({
      total: 30,
      upcomingAudiences: Array.from({ length: 8 }, (_, i) => ({
        id: i + 1,
        date: new Date('2026-09-23'),
        jurisdiction: 'TGI',
        dossierNumber: `DOS-${i + 1}`,
        clientName: 'Client',
        status: 0,
      })),
      upcomingAudiencesTotal: 8,
    });

    const overview = await service.getOverview();

    expect(overview.actions.diligencesEnRetard).toHaveLength(5);
    expect(overview.actions.echeancesProches).toHaveLength(5);
    expect(overview.actions.prochainesAudiences).toHaveLength(5);
    expect(overview.actions.totaux).toEqual({
      diligencesEnRetard: 12,
      echeancesProches: 9,
      prochainesAudiences: 8,
    });
  });

  describe('section financiere selon les droits', () => {
    const lawyer = {
      role: 'avocat',
      permissions: ['view_dashboard', 'view_dossiers', 'view_audiences'],
    };

    beforeEach(() => {
      factureStats.getStats.mockClear();
      factureStats.getStats.mockResolvedValue({
        total: 42,
        unpaidCount: 7,
        overdueCount: 3,
        totalTTC: 7654321,
        totalPaid: 5000000,
        totalUnpaid: 2654321,
        financialSummary: { recoveryRate: 65 },
        monthlyRevenue: [
          { month: '2026-08', totalTTC: '1111111', totalHT: '933000', totalPaid: '900000' },
          { month: '2026-09', totalTTC: '2222222', totalHT: '1866000', totalPaid: '1500000' },
        ],
        recentInvoices: [
          {
            id: 9,
            numero: 'FAC-2026-009',
            clientName: 'Client A',
            dateFacture: new Date('2026-10-01'),
            isPaid: false,
            isOverdue: true,
          },
        ],
      });
      dossierStats.getStats.mockResolvedValue({
        total: 3,
        recentDossiers: [
          {
            id: 12,
            dossierNumber: 'DOS-001',
            clientName: 'Client A',
            openingDate: new Date('2026-09-15'),
            status: 0,
          },
        ],
      });
    });

    it("ne charge ni ne renvoie la facturation a un avocat sans droit financier", async () => {
      const overview = await service.getOverview(lawyer);

      expect(factureStats.getStats).not.toHaveBeenCalled();
      expect(overview.financial).toBeNull();
      expect(overview.trends.factures).toEqual([]);
      expect(overview.recentActivity.map((a) => a.type)).not.toContain('facture');
      expect(overview.summary.totalFactures).toBe(0);
      expect(overview.alerts.facturesImpayees).toBe(0);
      // Aucun montant, nulle part dans la réponse.
      const body = JSON.stringify(overview);
      for (const amount of ['7654321', '5000000', '2654321', '1111111', '2222222', 'FAC-2026-009']) {
        expect(body).not.toContain(amount);
      }
      // Le reste du tableau de bord est intact.
      expect(overview.summary.totalDossiers).toBe(3);
      expect(overview.recentActivity.map((a) => a.type)).toContain('dossier');
    });

    it('masque aussi la facturation sans utilisateur connu', async () => {
      const overview = await service.getOverview();

      expect(factureStats.getStats).not.toHaveBeenCalled();
      expect(overview.financial).toBeNull();
      expect(overview.trends.factures).toEqual([]);
    });

    it.each([
      ['un admin', { role: 'admin', permissions: ['view_dashboard'] }],
      ['un SUPER_ADMIN', { role: 'avocat', permissions: ['SUPER_ADMIN'] }],
      ['view_factures', { role: 'comptable', permissions: ['view_dashboard', 'view_factures'] }],
      [
        'view_financial_reports',
        { role: 'avocat', permissions: ['view_dashboard', 'view_financial_reports'] },
      ],
    ])('renvoie toute la facturation pour %s', async (_label, user) => {
      const overview = await service.getOverview(user);

      expect(factureStats.getStats).toHaveBeenCalledTimes(1);
      expect(overview.financial).toEqual({
        totalFacture: 7654321,
        totalPaye: 5000000,
        totalImpaye: 2654321,
        tauxRecouvrement: 65,
        facturesEnRetard: 3,
      });
      expect(overview.trends.factures).toEqual([
        { month: '2026-08', totalTTC: 1111111, totalHT: 933000, totalPaid: 900000 },
        { month: '2026-09', totalTTC: 2222222, totalHT: 1866000, totalPaid: 1500000 },
      ]);
      expect(overview.recentActivity.map((a) => a.id)).toContain('facture-9');
      expect(overview.summary.totalFactures).toBe(42);
      expect(overview.alerts.facturesImpayees).toBe(7);
    });
  });
});
