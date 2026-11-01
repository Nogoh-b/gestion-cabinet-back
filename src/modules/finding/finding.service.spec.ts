import { BadRequestException } from '@nestjs/common';
import { FindingsService } from './finding.service';
import {
  Finding,
  FindingStatus,
} from './entities/finding.entity';

describe('FindingsService lifecycle', () => {
  const repository = {
    create: jest.fn((value) => ({
      ...value,
      diligence_id: value.diligence?.id,
      created_by_id: value.created_by?.id,
    })),
    findOne: jest.fn(),
    find: jest.fn(),
  };
  const paginationService = {} as any;
  const diligenceService = {
    findOne: jest.fn(),
    getAccessScope: jest.fn(),
  };
  const documentService = { findOne: jest.fn() };
  const findingRepository = { findOne: jest.fn() };
  const manager = {
    getRepository: jest.fn(() => findingRepository),
    save: jest.fn(async (value) => value),
    remove: jest.fn(),
  };
  const dataSource = {
    transaction: jest.fn(async (...args: any[]) => {
      const callback = args[args.length - 1];
      return callback(manager);
    }),
  };
  const auditService = {
    append: jest.fn().mockResolvedValue({ id: 'audit-2' }),
  };
  const outboxService = { enqueue: jest.fn().mockResolvedValue({}) };

  let service: FindingsService;

  beforeEach(() => {
    jest.clearAllMocks();
    manager.save.mockImplementation(async (value) => value);
    dataSource.transaction.mockImplementation(async (...args: any[]) => {
      const callback = args[args.length - 1];
      return callback(manager);
    });
    auditService.append.mockResolvedValue({ id: 'audit-2' });
    outboxService.enqueue.mockResolvedValue({});
    service = new FindingsService(
      repository as any,
      paginationService,
      diligenceService as any,
      documentService as any,
      dataSource as any,
      auditService as any,
      outboxService as any,
    );
  });

  it('valide sous verrou et écrit audit + outbox avec l’acteur réel', async () => {
    const finding = {
      id: 3,
      diligence_id: 5,
      diligence: { dossier_id: 12 },
      status: FindingStatus.IDENTIFIED,
      validate(userId: number) {
        this.status = FindingStatus.VALIDATED;
        this.validated_by_id = userId;
      },
    } as Finding;
    findingRepository.findOne.mockResolvedValue(finding);

    const result = await service.validate(3, 42);

    expect(result.status).toBe(FindingStatus.VALIDATED);
    expect((result as Finding).validated_by_id).toBe(42);
    expect(findingRepository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        lock: { mode: 'pessimistic_write' },
      }),
    );
    expect(auditService.append).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({
        actorId: 42,
        action: 'finding.validated',
        dossierId: 12,
      }),
    );
    expect(outboxService.enqueue).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({
        eventType: 'finding.validated',
        idempotencyKey: 'finding.validated:audit-2',
      }),
    );
  });

  it('refuse une acceptation de risque sans justification suffisante', async () => {
    await expect(service.waive(3, 'court', 42)).rejects.toThrow(
      BadRequestException,
    );
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('interdit la modification générique après validation', async () => {
    repository.findOne.mockResolvedValue({
      id: 3,
      document: null,
      diligence: { dossier_id: 12 },
    });
    findingRepository.findOne.mockResolvedValue({
      id: 3,
      diligence: { dossier_id: 12 },
      status: FindingStatus.VALIDATED,
    });

    await expect(service.update(3, { title: 'Nouveau' }, 42)).rejects.toThrow(
      'ne peut plus être modifié',
    );
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('refuse un document provenant d’un autre dossier', async () => {
    diligenceService.findOne.mockResolvedValue({
      id: 5,
      dossier_id: 12,
    });
    documentService.findOne.mockResolvedValue({
      id: 8,
      dossier_id: 99,
    });

    await expect(
      service.create(
        {
          title: 'Risque',
          diligence_id: 5,
          document_id: 8,
        } as any,
        42,
      ),
    ).rejects.toThrow('même dossier');
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('ignore toute identité client et attribue le créateur au JWT', async () => {
    diligenceService.findOne.mockResolvedValue({
      id: 5,
      dossier_id: 12,
    });

    const result = await service.create(
      {
        title: 'Risque',
        diligence_id: 5,
      } as any,
      42,
    );

    expect(result.created_by_id).toBe(42);
    expect(auditService.append).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({
        actorId: 42,
        action: 'finding.created',
      }),
    );
  });
});
