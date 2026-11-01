import { Column, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { TenantEntity } from 'src/core/entities/tenant.entity';

export enum LegalDeadlineRuleStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  RETIRED = 'RETIRED',
}

export enum LegalDeadlineDurationUnit {
  CALENDAR_DAYS = 'CALENDAR_DAYS',
  BUSINESS_DAYS = 'BUSINESS_DAYS',
  MONTHS = 'MONTHS',
}

export enum LegalNotificationMethod {
  PERSONAL_SERVICE = 'PERSONAL_SERVICE',
  REGISTRY = 'REGISTRY',
  ELECTRONIC = 'ELECTRONIC',
  POSTAL = 'POSTAL',
  OTHER = 'OTHER',
}

/**
 * Règle de calcul d'un délai juridique.
 *
 * Une règle ACTIVE est immuable : toute évolution est portée par une nouvelle
 * version afin que le calcul historique reste démontrable.
 */
@Entity('legal_deadline_rules')
@Unique(['tenant_id', 'familyKey', 'version'])
@Index(['tenant_id', 'status', 'notificationMethod'])
export class LegalDeadlineRule extends TenantEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'family_key', type: 'varchar', length: 80 })
  familyKey: string;

  @Column({ type: 'int', default: 1 })
  version: number;

  @Column({ type: 'varchar', length: 160 })
  name: string;

  @Column({
    type: 'enum',
    enum: LegalDeadlineRuleStatus,
    default: LegalDeadlineRuleStatus.DRAFT,
  })
  status: LegalDeadlineRuleStatus;

  @Column({ name: 'jurisdiction_id', type: 'int', nullable: true })
  jurisdictionId: number | null;

  @Column({ name: 'procedure_type_id', type: 'int', nullable: true })
  procedureTypeId: number | null;

  @Column({
    name: 'decision_outcome',
    type: 'varchar',
    length: 80,
    nullable: true,
  })
  decisionOutcome: string | null;

  @Column({
    name: 'notification_method',
    type: 'enum',
    enum: LegalNotificationMethod,
  })
  notificationMethod: LegalNotificationMethod;

  @Column({ name: 'duration_value', type: 'int' })
  durationValue: number;

  @Column({
    name: 'duration_unit',
    type: 'enum',
    enum: LegalDeadlineDurationUnit,
  })
  durationUnit: LegalDeadlineDurationUnit;

  @Column({ name: 'include_start_day', type: 'boolean', default: false })
  includeStartDay: boolean;

  @Column({
    name: 'expiry_event',
    type: 'varchar',
    length: 120,
    nullable: true,
  })
  expiryEvent: string | null;

  @Column({ name: 'warning_offsets', type: 'json', nullable: false })
  warningOffsets: number[];

  @Column({ type: 'int', default: 0 })
  priority: number;

  @Column({
    name: 'effective_from',
    type: 'datetime',
    precision: 6,
    nullable: true,
  })
  effectiveFrom: Date | null;

  @Column({
    name: 'effective_to',
    type: 'datetime',
    precision: 6,
    nullable: true,
  })
  effectiveTo: Date | null;

  @Column({
    name: 'activated_at',
    type: 'datetime',
    precision: 6,
    nullable: true,
  })
  activatedAt: Date | null;

  @Column({
    name: 'retired_at',
    type: 'datetime',
    precision: 6,
    nullable: true,
  })
  retiredAt: Date | null;
}
