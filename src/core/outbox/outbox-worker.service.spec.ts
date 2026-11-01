import { DataSource } from 'typeorm';
import {
  OutboxDeliveryAttemptStatus,
} from './outbox-delivery-attempt.entity';
import { OutboxEvent, OutboxEventStatus } from './outbox-event.entity';
import { OutboxEventDispatcher } from './outbox-event.dispatcher';
import {
  outboxClaimSql,
  OutboxWorkerService,
} from './outbox-worker.service';

function claimedEvent(attempts: number): OutboxEvent {
  return {
    id: '28416c27-c0b0-4c10-851f-989ca4d69eef',
    tenant_id: 8,
    eventType: 'procedure.transition.applied',
    aggregateType: 'ProcedureInstance',
    aggregateId: 'instance-1',
    idempotencyKey: 'transition:1',
    payload: {},
    status: OutboxEventStatus.PROCESSING,
    attempts,
    nextAttemptAt: null,
    processedAt: null,
    lastError: null,
    lockedAt: new Date(),
    lockedBy: 'worker',
  } as OutboxEvent;
}

function transactionHarness() {
  let eventPatch: any;
  let attemptPatch: any;
  const execute = jest.fn().mockResolvedValue({ affected: 1 });
  const builder: any = {
    update: jest.fn().mockReturnThis(),
    set: jest.fn((patch) => {
      eventPatch = patch;
      return builder;
    }),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    execute,
  };
  const updateAttempt = jest.fn((_criteria, patch) => {
    attemptPatch = patch;
    return Promise.resolve({ affected: 1 });
  });
  const manager: any = {
    createQueryBuilder: jest.fn(() => builder),
    getRepository: jest.fn(() => ({ update: updateAttempt })),
  };
  const dataSource: any = {
    transaction: jest.fn((callback) => callback(manager)),
  };
  return {
    dataSource,
    getEventPatch: () => eventPatch,
    getAttemptPatch: () => attemptPatch,
  };
}

describe('OutboxWorkerService', () => {
  it('réclame atomiquement un lot sans dépendre de SKIP LOCKED', async () => {
    const event = claimedEvent(1);
    const query = jest.fn(async (sql: string, parameters: string[]) => {
      event.lockedBy = parameters[0];
      return { affectedRows: 1 };
    });
    const eventRepository = {
      find: jest.fn().mockResolvedValue([event]),
    };
    const attemptsRepository = {
      create: jest.fn((value: any) => value),
      save: jest.fn((value: any) => Promise.resolve(value)),
    };
    const manager: any = {
      query,
      getRepository: jest.fn((entity: unknown) =>
        entity === OutboxEvent ? eventRepository : attemptsRepository,
      ),
    };
    const dataSource: any = {
      transaction: jest.fn((_isolation: string, callback: any) =>
        callback(manager),
      ),
    };
    const worker = new OutboxWorkerService(
      dataSource as DataSource,
      { dispatch: jest.fn() } as unknown as OutboxEventDispatcher,
    );

    const events = await worker.claimBatch();

    expect(events).toEqual([event]);
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, parameters] = query.mock.calls[0];
    expect(sql).toBe(outboxClaimSql());
    expect(sql).toContain('UPDATE outbox_events');
    expect(sql).toContain('ORDER BY created_at ASC, id ASC');
    expect(sql).toContain('LIMIT 25');
    expect(sql).not.toContain('SKIP LOCKED');
    expect(parameters[0]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(eventRepository.find).toHaveBeenCalledWith({
      where: {
        status: OutboxEventStatus.PROCESSING,
        lockedBy: parameters[0],
      },
      order: { created_at: 'ASC' },
    });
    expect(attemptsRepository.save).toHaveBeenCalledTimes(1);
  });

  it('ne déclare traité qu’après succès du gestionnaire', async () => {
    const harness = transactionHarness();
    const dispatcher = {
      dispatch: jest.fn().mockResolvedValue(undefined),
    };
    const worker = new OutboxWorkerService(
      harness.dataSource as DataSource,
      dispatcher as unknown as OutboxEventDispatcher,
    );

    await (worker as any).deliver(claimedEvent(1));

    expect(dispatcher.dispatch).toHaveBeenCalledTimes(1);
    expect(harness.getEventPatch().status).toBe(OutboxEventStatus.PROCESSED);
    expect(harness.getAttemptPatch().status).toBe(
      OutboxDeliveryAttemptStatus.SUCCEEDED,
    );
  });

  it('place définitivement en file d’échec après la huitième tentative', async () => {
    const harness = transactionHarness();
    const dispatcher = {
      dispatch: jest.fn().mockRejectedValue(new Error('service indisponible')),
    };
    const worker = new OutboxWorkerService(
      harness.dataSource as DataSource,
      dispatcher as unknown as OutboxEventDispatcher,
    );

    await (worker as any).deliver(claimedEvent(8));

    expect(harness.getEventPatch()).toEqual(
      expect.objectContaining({
        status: OutboxEventStatus.DEAD_LETTER,
        nextAttemptAt: null,
        lastError: 'service indisponible',
      }),
    );
    expect(harness.getAttemptPatch().status).toBe(
      OutboxDeliveryAttemptStatus.DEAD_LETTERED,
    );
  });
});
