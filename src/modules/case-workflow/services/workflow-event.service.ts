import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { getCurrentTenantId } from 'src/core/tenant/tenant.context';
import {
  CaseWorkflowEvent,
  CaseWorkflowOutbox,
} from '../entities/workflow-audit.entity';

@Injectable()
export class WorkflowEventService {
  async append(
    manager: EntityManager,
    input: {
      dossierId: number;
      eventType: string;
      aggregateType: string;
      aggregateId: string | number;
      actorUserId?: number | null;
      payload?: Record<string, unknown>;
      idempotencyKey: string;
      occurredAt?: Date;
    },
  ): Promise<CaseWorkflowEvent> {
    const tenantId = getCurrentTenantId();
    const repository = manager.getRepository(CaseWorkflowEvent);
    const existing = await repository.findOne({
      where: { tenant_id: tenantId, idempotency_key: input.idempotencyKey },
    });
    if (existing) return existing;

    const event = await repository.save(
      repository.create({
        tenant_id: tenantId,
        dossier_id: input.dossierId,
        event_type: input.eventType,
        aggregate_type: input.aggregateType,
        aggregate_id: String(input.aggregateId),
        actor_user_id: input.actorUserId ?? null,
        payload: input.payload ?? {},
        occurred_at: input.occurredAt ?? new Date(),
        idempotency_key: input.idempotencyKey,
      }),
    );

    const outboxRepository = manager.getRepository(CaseWorkflowOutbox);
    await outboxRepository.save(
      outboxRepository.create({
        tenant_id: tenantId,
        event_id: event.id,
        event_type: event.event_type,
        payload: {
          dossierId: event.dossier_id,
          aggregateType: event.aggregate_type,
          aggregateId: event.aggregate_id,
          ...event.payload,
        },
        available_at: new Date(),
        processed_at: null,
        attempts: 0,
      }),
    );

    return event;
  }
}
