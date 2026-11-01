import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum OutboxDeliveryAttemptStatus {
  STARTED = 'STARTED',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
  DEAD_LETTERED = 'DEAD_LETTERED',
}

@Entity('outbox_delivery_attempts')
@Index(['eventId', 'attemptNumber'], { unique: true })
export class OutboxDeliveryAttempt {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'event_id', type: 'char', length: 36 })
  eventId: string;

  @Column({ name: 'tenant_id', type: 'int' })
  tenantId: number;

  @Column({ name: 'attempt_number', type: 'int' })
  attemptNumber: number;

  @Column({
    type: 'enum',
    enum: OutboxDeliveryAttemptStatus,
    default: OutboxDeliveryAttemptStatus.STARTED,
  })
  status: OutboxDeliveryAttemptStatus;

  @Column({ name: 'worker_id', length: 120 })
  workerId: string;

  @Column({ name: 'started_at', type: 'datetime' })
  startedAt: Date;

  @Column({ name: 'finished_at', type: 'datetime', nullable: true })
  finishedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
