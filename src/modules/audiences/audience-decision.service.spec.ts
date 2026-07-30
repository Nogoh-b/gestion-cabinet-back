import { BadRequestException } from '@nestjs/common';
import { AudienceDecisionService } from './audience-decision.service';
import {
  AudienceRecordStatus,
  AudienceStatus,
} from './entities/audience.entity';

describe('AudienceDecisionService', () => {
  const repository = { findOne: jest.fn() };
  const manager = {
    findOne: jest.fn(),
    save: jest.fn(async (value) => value),
    query: jest.fn(),
    getRepository: jest.fn(),
  };
  const dataSource = {
    transaction: jest.fn(async (...args: any[]) => {
      const callback = args[args.length - 1];
      return callback(manager);
    }),
  };
  const audit = { append: jest.fn() };
  const outbox = { enqueue: jest.fn() };
  let service: AudienceDecisionService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AudienceDecisionService(
      repository as any,
      dataSource as any,
      audit as any,
      outbox as any,
    );
  });

  it('exige un motif avant d’amender une décision scellée', async () => {
    manager.findOne.mockResolvedValue({
      id: 1,
      dossier_id: 9,
      status: AudienceStatus.HELD,
      decision_record_status: AudienceRecordStatus.SEALED,
      decision_record_version: 1,
      decision_documents: [],
    });

    await expect(
      service.updateDecision(
        1,
        { decision: 'Nouvelle rédaction' },
        { id: 2, userId: 2, tenantId: 1 },
      ),
    ).rejects.toThrow(BadRequestException);
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('scelle la décision sans muter le dossier et publie un événement durable', async () => {
    manager.findOne.mockResolvedValue({
      id: 2,
      dossier_id: 9,
      procedure_instance_id: 'instance-9',
      decision_text: 'Dispositif de la décision',
      decision_date: new Date('2026-07-20'),
      decision_outcome: 'favorable',
      decision_notes: null,
      decision_documents: [],
      decision_record_status: AudienceRecordStatus.VALIDATED,
      decision_record_version: 1,
      decision_record_hash: null,
      decision_sealed_at: null,
    });

    const result = await service.sealDecision(
      2,
      { id: 2, userId: 2, tenantId: 1 },
    );

    expect(result.record_status).toBe(AudienceRecordStatus.SEALED);
    expect(result.record_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(outbox.enqueue).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({
        eventType: 'audience.decision.sealed',
        payload: expect.objectContaining({
          dossierId: 9,
          procedureInstanceId: 'instance-9',
        }),
      }),
    );
    expect(manager.save).toHaveBeenCalledTimes(1);
  });
});
