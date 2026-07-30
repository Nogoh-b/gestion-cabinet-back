import { randomUUID } from 'crypto';
import { hostname } from 'os';
import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { DataSource, In } from 'typeorm';
import { runWithTenantContext } from '../tenant/tenant.context';
import {
  OutboxDeliveryAttempt,
  OutboxDeliveryAttemptStatus,
} from './outbox-delivery-attempt.entity';
import { OutboxEvent, OutboxEventStatus } from './outbox-event.entity';
import { OutboxEventDispatcher } from './outbox-event.dispatcher';

const BATCH_SIZE = 25;
const MAX_ATTEMPTS = 8;
const STALE_LOCK_MINUTES = 10;

@Injectable()
export class OutboxWorkerService {
  private readonly logger = new Logger(OutboxWorkerService.name);
  private readonly workerId = `${hostname()}:${process.pid}:${randomUUID()}`;
  private running = false;

  constructor(
    private readonly dataSource: DataSource,
    private readonly dispatcher: OutboxEventDispatcher,
  ) {}

  @Interval(5000)
  async poll(): Promise<void> {
    if (this.running || process.env.OUTBOX_WORKER_ENABLED === 'false') return;
    this.running = true;
    try {
      const events = await this.claimBatch();
      for (const event of events) {
        await this.deliver(event);
      }
    } catch (error) {
      this.logger.error(
        `Échec du cycle outbox: ${this.errorMessage(error)}`,
      );
    } finally {
      this.running = false;
    }
  }

  async claimBatch(): Promise<OutboxEvent[]> {
    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      const candidates = await manager.query(
        `SELECT id
         FROM outbox_events
         WHERE deleted_at IS NULL
           AND (
             (
               status IN ('PENDING', 'FAILED')
               AND (next_attempt_at IS NULL OR next_attempt_at <= UTC_TIMESTAMP())
             )
             OR (
               status = 'PROCESSING'
               AND locked_at < DATE_SUB(
                 UTC_TIMESTAMP(),
                 INTERVAL ${STALE_LOCK_MINUTES} MINUTE
               )
             )
           )
         ORDER BY created_at ASC
         LIMIT ${BATCH_SIZE}
         FOR UPDATE SKIP LOCKED`,
      );
      const ids = candidates.map((row: any) => String(row.id));
      if (ids.length === 0) return [];

      await manager
        .createQueryBuilder()
        .update(OutboxEvent)
        .set({
          status: OutboxEventStatus.PROCESSING,
          attempts: () => 'attempts + 1',
          lockedAt: () => 'UTC_TIMESTAMP()',
          lockedBy: this.workerId,
          lastError: null,
        })
        .where({ id: In(ids) })
        .execute();

      const events = await manager.getRepository(OutboxEvent).find({
        where: { id: In(ids), lockedBy: this.workerId },
        order: { created_at: 'ASC' },
      });
      const attemptsRepository = manager.getRepository(OutboxDeliveryAttempt);
      await attemptsRepository.save(
        events.map((event) =>
          attemptsRepository.create({
            eventId: event.id,
            tenantId: event.tenant_id,
            attemptNumber: event.attempts,
            status: OutboxDeliveryAttemptStatus.STARTED,
            workerId: this.workerId,
            startedAt: new Date(),
            finishedAt: null,
            error: null,
          }),
        ),
      );
      return events;
    });
  }

  private async deliver(event: OutboxEvent): Promise<void> {
    try {
      await runWithTenantContext(event.tenant_id, () =>
        this.dispatcher.dispatch(event),
      );
      await this.finalizeSuccess(event);
    } catch (error) {
      await this.finalizeFailure(event, error);
    }
  }

  private async finalizeSuccess(event: OutboxEvent): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const result = await manager
        .createQueryBuilder()
        .update(OutboxEvent)
        .set({
          status: OutboxEventStatus.PROCESSED,
          processedAt: () => 'UTC_TIMESTAMP()',
          nextAttemptAt: null,
          lockedAt: null,
          lockedBy: null,
          lastError: null,
        })
        .where('id = :id', { id: event.id })
        .andWhere('status = :status', {
          status: OutboxEventStatus.PROCESSING,
        })
        .andWhere('locked_by = :workerId', { workerId: this.workerId })
        .execute();
      if (result.affected !== 1) {
        throw new Error(`Verrou outbox perdu pour ${event.id}`);
      }
      await manager.getRepository(OutboxDeliveryAttempt).update(
        { eventId: event.id, attemptNumber: event.attempts },
        {
          status: OutboxDeliveryAttemptStatus.SUCCEEDED,
          finishedAt: new Date(),
        },
      );
    });
  }

  private async finalizeFailure(
    event: OutboxEvent,
    error: unknown,
  ): Promise<void> {
    const message = this.errorMessage(error).slice(0, 8000);
    const exhausted = event.attempts >= MAX_ATTEMPTS;
    const retryAt = exhausted
      ? null
      : new Date(Date.now() + this.retryDelayMs(event.attempts));
    await this.dataSource.transaction(async (manager) => {
      await manager
        .createQueryBuilder()
        .update(OutboxEvent)
        .set({
          status: exhausted
            ? OutboxEventStatus.DEAD_LETTER
            : OutboxEventStatus.FAILED,
          nextAttemptAt: retryAt,
          lockedAt: null,
          lockedBy: null,
          lastError: message,
        })
        .where('id = :id', { id: event.id })
        .andWhere('status = :status', {
          status: OutboxEventStatus.PROCESSING,
        })
        .andWhere('locked_by = :workerId', { workerId: this.workerId })
        .execute();
      await manager.getRepository(OutboxDeliveryAttempt).update(
        { eventId: event.id, attemptNumber: event.attempts },
        {
          status: exhausted
            ? OutboxDeliveryAttemptStatus.DEAD_LETTERED
            : OutboxDeliveryAttemptStatus.FAILED,
          finishedAt: new Date(),
          error: message,
        },
      );
    });
    const context = `outbox=${event.id} type=${event.eventType} tentative=${event.attempts}`;
    if (exhausted) {
      this.logger.error(`Événement placé en file d'échec (${context}): ${message}`);
    } else {
      this.logger.warn(`Événement replanifié (${context}): ${message}`);
    }
  }

  private retryDelayMs(attempt: number): number {
    const exponent = Math.max(0, Math.min(attempt - 1, 8));
    return Math.min(60 * 60 * 1000, 30_000 * 2 ** exponent);
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
