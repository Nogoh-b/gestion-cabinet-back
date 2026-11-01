import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import { OutboxEvent, OutboxEventStatus } from './outbox-event.entity';
import { OutboxEventDispatcher } from './outbox-event.dispatcher';

function event(overrides: Partial<OutboxEvent> = {}): OutboxEvent {
  return {
    id: '2e9079c6-b29f-47d5-a967-443151df811f',
    tenant_id: 7,
    eventType: 'dossier.member.revoked',
    aggregateType: 'Dossier',
    aggregateId: '42',
    idempotencyKey: 'dossier-member-revoked:audit-1',
    payload: { dossierId: 42, userId: 12 },
    status: OutboxEventStatus.PROCESSING,
    attempts: 1,
    nextAttemptAt: null,
    processedAt: null,
    lastError: null,
    lockedAt: new Date(),
    lockedBy: 'worker',
    created_at: new Date('2026-07-27T12:00:00.000Z'),
    updated_at: new Date(),
    deleted_at: null,
    ...overrides,
  } as OutboxEvent;
}

describe('OutboxEventDispatcher', () => {
  it('retire un membre du chat avec un filtre cabinet avant de publier', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ conversationId: 31 }])
      .mockResolvedValueOnce({ affectedRows: 1 });
    const emitAsync = jest.fn().mockResolvedValue([]);
    const dispatcher = new OutboxEventDispatcher(
      { query } as unknown as DataSource,
      { emitAsync } as unknown as EventEmitter2,
    );

    await dispatcher.dispatch(event());

    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0][1]).toEqual([42, 7]);
    expect(query.mock.calls[1][1]).toEqual([31, 12, 7, 7]);
    expect(emitAsync).toHaveBeenCalledWith(
      'outbox.dossier.member.revoked',
      expect.objectContaining({
        conversationId: 31,
        dossierId: 42,
        userId: 12,
        tenantId: 7,
      }),
    );
    expect(query.mock.invocationCallOrder[1]).toBeLessThan(
      emitAsync.mock.invocationCallOrder[0],
    );
  });

  it('refuse de marquer implicitement un type sans gestionnaire', async () => {
    const query = jest.fn();
    const emitAsync = jest.fn();
    const dispatcher = new OutboxEventDispatcher(
      { query } as unknown as DataSource,
      { emitAsync } as unknown as EventEmitter2,
    );

    await expect(
      dispatcher.dispatch(event({ eventType: 'unknown.event' })),
    ).rejects.toThrow('sans gestionnaire');
    expect(query).not.toHaveBeenCalled();
    expect(emitAsync).not.toHaveBeenCalled();
  });
});
