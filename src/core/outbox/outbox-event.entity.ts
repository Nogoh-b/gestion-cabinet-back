import {
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { TenantEntity } from '../entities/tenant.entity';

export enum OutboxEventStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  PROCESSED = 'PROCESSED',
  FAILED = 'FAILED',
  DEAD_LETTER = 'DEAD_LETTER',
}

@Entity('outbox_events')
@Unique(['tenant_id', 'idempotencyKey'])
@Index(['tenant_id', 'status', 'nextAttemptAt'])
export class OutboxEvent extends TenantEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'event_type', length: 120 })
  eventType: string;

  @Column({ name: 'aggregate_type', length: 80 })
  aggregateType: string;

  @Column({ name: 'aggregate_id', length: 80 })
  aggregateId: string;

  @Column({ name: 'idempotency_key', length: 190 })
  idempotencyKey: string;

  @Column({ type: 'json' })
  payload: Record<string, any>;

  @Column({
    type: 'enum',
    enum: OutboxEventStatus,
    default: OutboxEventStatus.PENDING,
  })
  status: OutboxEventStatus;

  @Column({ default: 0 })
  attempts: number;

  @Column({ name: 'next_attempt_at', type: 'datetime', nullable: true })
  nextAttemptAt: Date | null;

  @Column({ name: 'processed_at', type: 'datetime', nullable: true })
  processedAt: Date | null;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError: string | null;

  @Column({ name: 'locked_at', type: 'datetime', nullable: true })
  lockedAt: Date | null;

  @Column({
    name: 'locked_by',
    type: 'varchar',
    length: 120,
    nullable: true,
  })
  lockedBy: string | null;
}
