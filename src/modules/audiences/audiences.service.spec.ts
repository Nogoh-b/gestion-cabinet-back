import { BadRequestException } from '@nestjs/common';
import { AudiencesService } from './audiences.service';
import {
  AudienceRecordStatus,
  AudienceStatus,
} from './entities/audience.entity';

describe('AudiencesService - commandes métier', () => {
  const repository = {
    findOne: jest.fn(),
    save: jest.fn(),
  };
  const manager = {
    findOne: jest.fn(),
    save: jest.fn(async (value) => value),
    query: jest.fn(),
  };
  const dataSource = {
    transaction: jest.fn(async (...args: any[]) => {
      const callback = args[args.length - 1];
      return callback(manager);
    }),
  };
  const outbox = { enqueue: jest.fn() };
  const audit = { append: jest.fn() };
  let service: AudiencesService;

  beforeEach(() => {
    jest.clearAllMocks();
    manager.findOne.mockReset();
    manager.save.mockReset().mockImplementation(async (value) => value);
    manager.query.mockReset();
    service = new AudiencesService(
      repository as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      dataSource as any,
      outbox as any,
      audit as any,
      {} as any,
    );
  });

  it('interdit la suppression physique d’une audience', async () => {
    await expect(service.remove(12)).rejects.toThrow(BadRequestException);
    expect(repository.findOne).not.toHaveBeenCalled();
  });

  it('interdit de réaffecter une audience à un autre dossier', async () => {
    jest.spyOn(service as any, 'findOneV1').mockResolvedValue({
      id: 12,
      dossier_id: 42,
      status: AudienceStatus.SCHEDULED,
    });

    await expect(
      service.update(
        12,
        { dossier_id: 99 } as any,
        { id: 3, userId: 3, tenantId: 1 },
      ),
    ).rejects.toThrow('immuables');
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('interdit de contourner le cycle du rapport par le PATCH générique', async () => {
    jest.spyOn(service as any, 'findOneV1').mockResolvedValue({
      id: 12,
      dossier_id: 42,
      status: AudienceStatus.SCHEDULED,
    });

    await expect(
      service.update(
        12,
        { report_content: 'Rapport injecté' } as any,
        { id: 3, userId: 3, tenantId: 1 },
      ),
    ).rejects.toThrow('cycle du rapport');
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('marque une audience passée comme tenue dans une transaction et publie l’outbox', async () => {
    manager.findOne.mockResolvedValue({
      id: 8,
      dossier_id: 42,
      procedure_instance_id: 'instance-1',
      status: AudienceStatus.SCHEDULED,
      starts_at_utc: new Date(Date.now() - 60_000),
      notes: null,
    });

    const result = await service.markAsHeld(
      8,
      'Audience effectivement tenue',
      { id: 3, userId: 3, tenantId: 1 },
    );

    expect(result.status).toBe(AudienceStatus.HELD);
    expect(outbox.enqueue).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({
        eventType: 'audience.held',
        idempotencyKey: 'audience-held:8',
      }),
    );
    expect(audit.append).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({ action: 'audience.held', dossierId: 42 }),
    );
  });

  it('refuse de marquer une audience future comme tenue', async () => {
    manager.findOne.mockResolvedValue({
      id: 9,
      dossier_id: 42,
      status: AudienceStatus.SCHEDULED,
      starts_at_utc: new Date(Date.now() + 60_000),
    });

    await expect(
      service.markAsHeld(9, undefined, {
        id: 3,
        userId: 3,
        tenantId: 1,
      }),
    ).rejects.toThrow('future');
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('exige un motif avant toute correction d’un rapport scellé', async () => {
    manager.findOne.mockResolvedValue({
      id: 10,
      dossier_id: 42,
      report_record_status: AudienceRecordStatus.SEALED,
      report_record_version: 1,
      report_documents: [],
    });

    await expect(
      service.updateReport(
        10,
        { report_content: 'Correction sans justification' },
        { id: 3, userId: 3, tenantId: 1 },
      ),
    ).rejects.toThrow('motif');
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('exige un motif suffisamment explicite pour annuler', async () => {
    await expect(
      service.cancel(10, 'court', {
        id: 3,
        userId: 3,
        tenantId: 1,
      }),
    ).rejects.toThrow('10 caractères');
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });
});
