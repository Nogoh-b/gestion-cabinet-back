import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { getCurrentTenantId } from '../tenant/tenant.context';
import { OutboxEvent, OutboxEventStatus } from './outbox-event.entity';

export interface EnqueueOutboxEvent {
  eventType: string;
  aggregateType: string;
  aggregateId: string | number;
  idempotencyKey: string;
  payload?: Record<string, any>;
  nextAttemptAt?: Date | null;
}

@Injectable()
export class OutboxService {
  constructor(
    @InjectRepository(OutboxEvent)
    private readonly repository: Repository<OutboxEvent>,
  ) {}

  async enqueue(
    manager: EntityManager,
    input: EnqueueOutboxEvent,
  ): Promise<OutboxEvent> {
    const repository = manager.getRepository(OutboxEvent);
    const tenantId = getCurrentTenantId();
    const existing = await repository.findOne({
      where: {
        tenant_id: tenantId,
        idempotencyKey: input.idempotencyKey,
      },
    });
    if (existing) return existing;

    return repository.save(
      repository.create({
        tenant_id: tenantId,
        eventType: input.eventType,
        aggregateType: input.aggregateType,
        aggregateId: String(input.aggregateId),
        idempotencyKey: input.idempotencyKey,
        payload: input.payload ?? {},
        status: OutboxEventStatus.PENDING,
        attempts: 0,
        nextAttemptAt: input.nextAttemptAt ?? new Date(),
        processedAt: null,
        lastError: null,
        lockedAt: null,
        lockedBy: null,
      }),
    );
  }
}
