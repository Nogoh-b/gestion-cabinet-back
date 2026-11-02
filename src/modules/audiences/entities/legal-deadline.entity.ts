import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { TenantEntity } from 'src/core/entities/tenant.entity';
import { Audience } from './audience.entity';
import {
  LegalDeadlineDurationUnit,
  LegalDeadlineRule,
  LegalNotificationMethod,
} from './legal-deadline-rule.entity';

export enum LegalDeadlineStatus {
  OPEN = 'OPEN',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
}

/**
 * Résultat immuable du calcul d'une règle à une date de notification donnée.
 * Les paramètres déterminants sont recopiés pour conserver la preuve même si
 * la règle est ensuite retirée.
 */
@Entity('legal_deadlines')
@Unique(['tenant_id', 'idempotencyKey'])
@Index(['tenant_id', 'status', 'dueAtUtc'])
@Index(['tenant_id', 'dossierId'])
export class LegalDeadline extends TenantEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'audience_id', type: 'int' })
  audienceId: number;

  @ManyToOne(() => Audience, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'audience_id' })
  audience: Audience;

  @Column({ name: 'dossier_id', type: 'int' })
  dossierId: number;

  @Column({
    name: 'procedure_instance_id',
    type: 'varchar',
    length: 36,
    nullable: true,
  })
  procedureInstanceId: string | null;

  @Column({ name: 'rule_id', type: 'int' })
  ruleId: number;

  @ManyToOne(() => LegalDeadlineRule, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'rule_id' })
  rule: LegalDeadlineRule;

  @Column({ name: 'rule_family_key', type: 'varchar', length: 80 })
  ruleFamilyKey: string;

  @Column({ name: 'rule_version', type: 'int' })
  ruleVersion: number;

  @Column({
    name: 'duration_unit',
    type: 'enum',
    enum: LegalDeadlineDurationUnit,
  })
  durationUnit: LegalDeadlineDurationUnit;

  @Column({ name: 'duration_value', type: 'int' })
  durationValue: number;

  @Column({
    name: 'notification_method',
    type: 'enum',
    enum: LegalNotificationMethod,
  })
  notificationMethod: LegalNotificationMethod;

  @Column({
    name: 'notification_reference',
    type: 'varchar',
    length: 190,
    nullable: true,
  })
  notificationReference: string | null;

  @Column({
    name: 'notified_at_utc',
    type: 'datetime',
    precision: 6,
  })
  notifiedAtUtc: Date;

  @Column({ name: 'due_at_utc', type: 'datetime', precision: 6 })
  dueAtUtc: Date;

  @Column({ type: 'varchar', length: 64 })
  timezone: string;

  @Column({
    type: 'enum',
    enum: LegalDeadlineStatus,
    default: LegalDeadlineStatus.OPEN,
  })
  status: LegalDeadlineStatus;

  @Column({
    name: 'expiry_event',
    type: 'varchar',
    length: 120,
    nullable: true,
  })
  expiryEvent: string | null;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 190 })
  idempotencyKey: string;

  @Column({
    name: 'completed_at',
    type: 'datetime',
    precision: 6,
    nullable: true,
  })
  completedAt: Date | null;

  @Column({
    name: 'cancelled_at',
    type: 'datetime',
    precision: 6,
    nullable: true,
  })
  cancelledAt: Date | null;

  @Column({
    name: 'expired_at',
    type: 'datetime',
    precision: 6,
    nullable: true,
  })
  expiredAt: Date | null;

  @Column({ name: 'closure_reason', type: 'text', nullable: true })
  closureReason: string | null;
}
