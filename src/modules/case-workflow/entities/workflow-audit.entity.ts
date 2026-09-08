import { TenantEntity } from 'src/core/entities/tenant.entity';
import {
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  VersionColumn,
} from 'typeorm';
import {
  ClosureReviewStatus,
  MigrationRunStatus,
} from '../case-workflow.enums';

@Entity('case_workflow_features')
@Index('UQ_case_workflow_feature_tenant', ['tenant_id'], { unique: true })
export class CaseWorkflowFeature extends TenantEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'boolean', default: false })
  enabled: boolean;

  @Column({ name: 'default_for_new_dossiers', type: 'boolean', default: false })
  default_for_new_dossiers: boolean;
}

@Entity('legacy_workflow_mappings')
@Index(
  'UQ_legacy_workflow_mapping_pattern',
  ['tenant_id', 'match_mode', 'match_pattern'],
  { unique: true },
)
@Index('IDX_legacy_workflow_mapping_active', [
  'tenant_id',
  'is_active',
  'priority',
])
export class LegacyWorkflowMapping extends TenantEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'match_pattern', length: 255 })
  match_pattern: string;

  @Column({
    name: 'match_mode',
    type: 'varchar',
    length: 20,
    default: 'CONTAINS',
  })
  match_mode: 'CONTAINS' | 'EXACT';

  @Column({ name: 'action_definition_code', length: 100 })
  action_definition_code: string;

  @Column({ type: 'int', default: 0 })
  priority: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  is_active: boolean;

  @VersionColumn({ name: 'lock_version', type: 'int', default: 1 })
  lock_version: number;
}

@Entity('case_workflow_events')
@Index('UQ_case_workflow_event_idempotency', ['tenant_id', 'idempotency_key'], {
  unique: true,
})
@Index('IDX_case_workflow_event_stream', [
  'tenant_id',
  'dossier_id',
  'occurred_at',
])
export class CaseWorkflowEvent extends TenantEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'dossier_id', type: 'int' })
  dossier_id: number;

  @Column({ name: 'event_type', length: 120 })
  event_type: string;

  @Column({ name: 'aggregate_type', length: 80 })
  aggregate_type: string;

  @Column({ name: 'aggregate_id', length: 80 })
  aggregate_id: string;

  @Column({ name: 'actor_user_id', type: 'int', nullable: true })
  actor_user_id: number | null;

  @Column({ type: 'json' })
  payload: Record<string, unknown>;

  @Column({ name: 'occurred_at', type: 'datetime' })
  occurred_at: Date;

  @Column({ name: 'idempotency_key', length: 180 })
  idempotency_key: string;
}

@Entity('case_workflow_outbox')
@Index('UQ_case_workflow_outbox_event', ['tenant_id', 'event_id'], {
  unique: true,
})
export class CaseWorkflowOutbox extends TenantEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'event_id', type: 'varchar', length: 36 })
  event_id: string;

  @Column({ name: 'event_type', length: 120 })
  event_type: string;

  @Column({ type: 'json' })
  payload: Record<string, unknown>;

  @Column({ name: 'available_at', type: 'datetime' })
  available_at: Date;

  @Column({ name: 'processed_at', type: 'datetime', nullable: true })
  processed_at: Date | null;

  @Column({ type: 'int', default: 0 })
  attempts: number;
}

@Entity('dossier_closure_reviews')
@Index('IDX_dossier_closure_review', ['tenant_id', 'dossier_id', 'created_at'])
export class DossierClosureReview extends TenantEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'dossier_id', type: 'int' })
  dossier_id: number;

  @Column({
    type: 'enum',
    enum: ClosureReviewStatus,
    default: ClosureReviewStatus.CHECKED,
  })
  status: ClosureReviewStatus;

  @Column({ type: 'json' })
  blockers: Array<Record<string, unknown>>;

  @Column({ type: 'json' })
  warnings: Array<Record<string, unknown>>;

  @Column({ type: 'json', nullable: true })
  resolutions: Array<Record<string, unknown>> | null;

  @Column({ type: 'text', nullable: true })
  justification: string | null;

  @Column({ name: 'actor_user_id', type: 'int' })
  actor_user_id: number;

  @Column({ name: 'checked_at', type: 'datetime' })
  checked_at: Date;
}

@Entity('case_workflow_migration_runs')
@Index('IDX_case_workflow_migration_dossier', [
  'tenant_id',
  'dossier_id',
  'created_at',
])
export class CaseWorkflowMigrationRun extends TenantEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'dossier_id', type: 'int' })
  dossier_id: number;

  @Column({ type: 'enum', enum: MigrationRunStatus })
  status: MigrationRunStatus;

  @Column({ name: 'mapping_version', length: 80 })
  mapping_version: string;

  @Column({ name: 'legacy_snapshot', type: 'json' })
  legacy_snapshot: Record<string, unknown>;

  @Column({ name: 'preview_result', type: 'json' })
  preview_result: Record<string, unknown>;

  @Column({ name: 'applied_action_ids', type: 'json', nullable: true })
  applied_action_ids: string[] | null;

  @Column({ name: 'actor_user_id', type: 'int' })
  actor_user_id: number;

  @Column({ name: 'confirmed_at', type: 'datetime', nullable: true })
  confirmed_at: Date | null;

  @Column({ name: 'rolled_back_at', type: 'datetime', nullable: true })
  rolled_back_at: Date | null;
}
