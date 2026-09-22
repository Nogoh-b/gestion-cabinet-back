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

describe('DashboardService', () => {
  let service: DashboardService;

  const dossierStats = { getStats: jest.fn<() => Promise<any>>() };
  const audienceStats = { getStats: jest.fn<() => Promise<any>>() };
  const diligenceStats = { getStats: jest.fn<() => Promise<any>>() };
  const documentStats = { getStats: jest.fn<() => Promise<any>>() };
  const factureStats = { getStats: jest.fn<() => Promise<any>>() };
  const customerStats = { getStats: jest.fn<() => Promise<any>>() };
  const employeeStats = { getStats: jest.fn<() => Promise<any>>() };

  beforeEach(async () => {
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
      diligencesEnRetard: [],
      echeancesProches: [],
      prochainesAudiences: [],
    });
  });
});
