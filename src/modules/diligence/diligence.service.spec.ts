import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PaginationServiceV1 } from 'src/core/shared/services/pagination/paginations-v1.service';
import { DiligencesService } from './diligence.service';
import { Diligence } from './entities/diligence.entity';
import { DossierAction } from '../case-workflow/entities/dossier-action.entity';
import { CaseWorkflowEvent } from '../case-workflow/entities/workflow-audit.entity';
import { DossiersService } from '../dossiers/dossiers.service';
import { UsersService } from '../iam/user/user.service';
import { DocumentCustomerService } from '../documents/document-customer/document-customer.service';
import { FindingsService } from '../finding/finding.service';

describe('DiligencesService', () => {
  let service: DiligencesService;

  const repository = {
    findOne: jest.fn<(id?: any) => Promise<any>>(),
    manager: {
      getRepository: jest.fn<(entity?: any) => any>(),
    },
  };
  const actionRepository = { findOne: jest.fn<() => Promise<any>>() };
  const eventRepository = { find: jest.fn<() => Promise<any>>() };

  beforeEach(async () => {
    repository.findOne.mockReset();
    repository.manager.getRepository.mockReset();
    actionRepository.findOne.mockReset();
    eventRepository.find.mockReset();
    repository.manager.getRepository.mockImplementation((entity: any) =>
      entity === CaseWorkflowEvent ? eventRepository : actionRepository,
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DiligencesService,
        { provide: 'DiligenceRepository', useValue: repository },
        { provide: PaginationServiceV1, useValue: {} },
        { provide: DossiersService, useValue: {} },
        { provide: UsersService, useValue: {} },
        { provide: DocumentCustomerService, useValue: {} },
        { provide: FindingsService, useValue: {} },
      ],
    })
      .overrideProvider('DiligenceRepository')
      .useValue(repository)
      .compile();

    service = module.get<DiligencesService>(DiligencesService);
    // Le repository est injecte via @InjectRepository(Diligence) : on le force
    // sur l'instance pour rester independant du token DI genere par TypeORM.
    (service as any).repository = repository;
  });

  function diligenceFixture(overrides: Partial<Diligence> = {}): any {
    return {
      id: 5,
      tenant_id: 'tenant-1',
      source_action_id: 'action-uuid-1',
      title: 'Conclusions en replique',
      description: 'Rediger les conclusions',
      type: 'litigation',
      status: 'in_progress',
      priority: 'high',
      start_date: new Date('2026-09-01'),
      deadline: new Date('2026-10-01'),
      dossier_id: 12,
      dossier: { id: 12, dossier_number: 'DOS-001', object: 'Litige', client: null },
      assigned_lawyer: null,
      findings: [],
      documents: [],
      ...overrides,
    };
  }

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('findOne expose l action d origine et l historique des reports', async () => {
    repository.findOne.mockResolvedValue(diligenceFixture());
    actionRepository.findOne.mockResolvedValue({
      id: 'action-uuid-1',
      dossier_id: 12,
      title: 'Rediger conclusions',
      status: 'in_progress',
      priority: 'high',
      due_at: new Date('2026-10-01'),
    });
    eventRepository.find.mockResolvedValue([
      {
        event_type: 'DOSSIER_ACTION_DEADLINE_SET',
        payload: { previousDueAt: null, dueAt: '2026-09-15T00:00:00.000Z', reason: 'Echeance initiale' },
        created_at: new Date('2026-09-01'),
      },
      {
        event_type: 'DOSSIER_ACTION_DEADLINE_EXTENDED',
        payload: {
          previousDueAt: '2026-09-15T00:00:00.000Z',
          dueAt: '2026-10-01T00:00:00.000Z',
          reason: 'Delai de signification prolonge',
        },
        created_at: new Date('2026-09-12'),
      },
    ]);

    const result = await service.findOne(5);

    expect(result.source_action).toEqual({
      id: 'action-uuid-1',
      dossierId: 12,
      title: 'Rediger conclusions',
      status: 'in_progress',
      priority: 'high',
      dueAt: new Date('2026-10-01'),
    });
    expect(result.deadline_extensions.count).toBe(1);
    expect(result.deadline_extensions.history).toEqual([
      {
        date: new Date('2026-09-12'),
        previousDueAt: '2026-09-15T00:00:00.000Z',
        dueAt: '2026-10-01T00:00:00.000Z',
        reason: 'Delai de signification prolonge',
      },
    ]);
    expect(eventRepository.find).toHaveBeenCalledTimes(1);
  });

  it('findOne sans action d origine retourne des extensions vides', async () => {
    repository.findOne.mockResolvedValue(diligenceFixture({ source_action_id: null }));

    const result = await service.findOne(5);

    expect(result.source_action).toBeNull();
    expect(result.deadline_extensions).toEqual({ count: 0, history: [] });
    expect(repository.manager.getRepository).not.toHaveBeenCalled();
  });

  it('findOne leve NotFoundException quand la diligence est absente', async () => {
    repository.findOne.mockResolvedValue(null);

    await expect(service.findOne(999)).rejects.toBeInstanceOf(NotFoundException);
  });
});
