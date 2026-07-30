import { DataSource } from 'typeorm';
import {
  OutboxDeliveryAttemptStatus,
} from './outbox-delivery-attempt.entity';
import { OutboxEvent, OutboxEventStatus } from './outbox-event.entity';
import { OutboxEventDispatcher } from './outbox-event.dispatcher';
import { OutboxWorkerService } from './outbox-worker.service';

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
