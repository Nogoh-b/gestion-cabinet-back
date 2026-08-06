import { BadRequestException } from '@nestjs/common';
import { DiligencesService } from './diligence.service';
import {
  Diligence,
  DiligenceStatus,
} from './entities/diligence.entity';

describe('DiligencesService lifecycle', () => {
  const repository = {
    create: jest.fn((value) => value),
    findOne: jest.fn(),
  };
  const paginationService = {} as any;
  const dossierService = { findOne: jest.fn() };
  const usersService = { findOne: jest.fn() };
  const documentService = { findByIds: jest.fn() };
  const auditService = {
    append: jest.fn().mockResolvedValue({ id: 'audit-1' }),
  };
  const outboxService = { enqueue: jest.fn().mockResolvedValue({}) };
  const diligenceRepository = { findOne: jest.fn() };
  const memberRepository = { findOne: jest.fn() };
  const manager = {
    getRepository: jest.fn((entity) => {
      if (entity === Diligence) return diligenceRepository;
      return memberRepository;
    }),
    save: jest.fn(async (value) => value),
    remove: jest.fn(),
  };
  const dataSource = {
    transaction: jest.fn(async (...args: any[]) => {
      const callback = args[args.length - 1];
      return callback(manager);
    }),
    getRepository: jest.fn(),
  };

  let service: DiligencesService;

  beforeEach(() => {
    jest.clearAllMocks();
    auditService.append.mockResolvedValue({ id: 'audit-1' });
    outboxService.enqueue.mockResolvedValue({});
    manager.save.mockImplementation(async (value) => value);
    dataSource.transaction.mockImplementation(async (...args: any[]) => {
      const callback = args[args.length - 1];
      return callback(manager);
    });
    service = new DiligencesService(
      repository as any,
      paginationService,
      dossierService as any,
      usersService as any,
      documentService as any,
      dataSource as any,
      auditService as any,
      outboxService as any,
    );
  });

  it('sérialise le démarrage et écrit audit + outbox dans la transaction', async () => {
    const diligence = {
      id: 7,
      dossier_id: 12,
      status: DiligenceStatus.DRAFT,
      findings: [],
    } as unknown as Diligence;
    diligenceRepository.findOne.mockResolvedValue(diligence);

    const result = await service.start(7, 42);

    expect(result.status).toBe(DiligenceStatus.IN_PROGRESS);
    expect(diligenceRepository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        lock: { mode: 'pessimistic_write' },
      }),
    );
    expect(auditService.append).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({
        actorId: 42,
        action: 'diligence.started',
        dossierId: 12,
      }),
    );
    expect(outboxService.enqueue).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({
        eventType: 'diligence.started',
        idempotencyKey: 'diligence.started:audit-1',
      }),
    );
  });

  it('bloque la clôture si un constat critique reste non traité', async () => {
    diligenceRepository.findOne.mockResolvedValue({
      id: 8,
      dossier_id: 12,
      status: DiligenceStatus.REVIEW,
      findings: [{ severity: 'critical', status: 'validated' }],
    });

    await expect(service.complete(8, undefined, 42)).rejects.toThrow(
      BadRequestException,
    );
    expect(manager.save).not.toHaveBeenCalled();
    expect(auditService.append).not.toHaveBeenCalled();
  });

  it('refuse de supprimer une diligence qui contient des constats', async () => {
    diligenceRepository.findOne.mockResolvedValue({
      id: 9,
      dossier_id: 12,
      status: DiligenceStatus.DRAFT,
      findings: [{ id: 1 }],
    });

    await expect(service.remove(9, 42)).rejects.toThrow(
      'La diligence contient des constats',
    );
    expect(manager.remove).not.toHaveBeenCalled();
  });

  it('exige un membre actif du dossier pour l’avocat assigné', async () => {
    repository.findOne.mockResolvedValue({
      id: 10,
      dossier_id: 12,
      status: DiligenceStatus.DRAFT,
      start_date: new Date('2026-01-01'),
      deadline: new Date('2026-02-01'),
    });
    usersService.findOne.mockResolvedValue({ id: 55 });
    diligenceRepository.findOne.mockResolvedValue({
      id: 10,
      dossier_id: 12,
      status: DiligenceStatus.DRAFT,
      start_date: new Date('2026-01-01'),
      deadline: new Date('2026-02-01'),
    });
    memberRepository.findOne.mockResolvedValue(null);

    await expect(
      service.update(10, { assigned_lawyer_id: 55 }, 42),
    ).rejects.toThrow('membre actif du dossier');
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('refuse une visite procédurale appartenant à une autre instance', async () => {
    dossierService.findOne.mockResolvedValue({
      id: 12,
      procedureInstanceId: 'instance-dossier',
    });
    dataSource.getRepository.mockReturnValue({
      findOne: jest.fn().mockResolvedValue({
        id: 'visit-foreign',
        instanceId: 'instance-etrangere',
      }),
    });

    await expect(
      service.create(
        {
          dossier_id: 12,
          title: 'Audit contractuel',
          type: 'contract',
          start_date: new Date('2026-01-01'),
          deadline: new Date('2026-02-01'),
          stage_visit_id: 'visit-foreign',
        } as any,
        42,
      ),
    ).rejects.toThrow("n’appartient pas à l’instance du dossier");
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });
});
