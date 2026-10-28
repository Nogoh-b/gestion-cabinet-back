import {
  BusinessColumn,
  BusinessTable,
} from 'src/core/decorators/business-metadata.decorator';
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
@BusinessTable({
  label: 'Activation du parcours d’actions',
  description:
    'Activation du traitement orienté actions pour le cabinet (enabled) et choix par défaut des nouveaux dossiers.',
  category: 'traitement',
  readOnly: true,
})
export class CaseWorkflowFeature extends TenantEntity {
  @PrimaryGeneratedColumn('uuid')
  @BusinessColumn({
    label: 'Identifiant',
    description: 'Non exposé',
    importance: 'low',
    ignored: true,
  })
  id: string;

  @Column({ type: 'boolean', default: true })
  @BusinessColumn({
    label: 'Activé',
    description: 'Parcours d’actions activé pour le cabinet',
  })
  enabled: boolean;

  @Column({ name: 'default_for_new_dossiers', type: 'boolean', default: false })
  @BusinessColumn({
    label: 'Par défaut',
    description: 'Appliqué par défaut aux nouveaux dossiers',
  })
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
@BusinessTable({
  label: 'Journal du parcours',
  description:
    "Historique des événements du parcours de traitement d'un dossier (action créée, terminée, clôture…) : type d'événement, date.",
  category: 'traitement',
  readOnly: true,
})
export class CaseWorkflowEvent extends TenantEntity {
  @PrimaryGeneratedColumn('uuid')
  @BusinessColumn({
    label: 'Identifiant',
    description: 'Non exposé',
    importance: 'low',
    ignored: true,
  })
  id: string;

  @Column({ name: 'dossier_id', type: 'int' })
  @BusinessColumn({
    label: 'Dossier',
    description: 'Dossier concerné (dossiers.id)',
  })
  dossier_id: number;

  @Column({ name: 'event_type', length: 120 })
  @BusinessColumn({
    label: "Type d'événement",
    description: "Nature de l'événement",
    importance: 'critical',
  })
  event_type: string;

  @Column({ name: 'aggregate_type', length: 80 })
  @BusinessColumn({
    label: 'Objet',
    description: 'Non exposé',
    importance: 'low',
    ignored: true,
  })
  aggregate_type: string;

  @Column({ name: 'aggregate_id', length: 80 })
  @BusinessColumn({
    label: 'Identifiant objet',
    description: 'Non exposé',
    importance: 'low',
    ignored: true,
  })
  aggregate_id: string;

  @Column({ name: 'actor_user_id', type: 'int', nullable: true })
  @BusinessColumn({
    label: 'Auteur',
    description: 'Non exposé',
    importance: 'low',
    ignored: true,
  })
  actor_user_id: number | null;

  @Column({ type: 'json' })
  @BusinessColumn({
    label: 'Données',
    description: 'Non exposé',
    importance: 'low',
    ignored: true,
  })
  payload: Record<string, unknown>;

  @Column({ name: 'occurred_at', type: 'datetime' })
  @BusinessColumn({
    label: 'Survenu le',
    description: "Date de l'événement",
    format: 'date',
  })
  occurred_at: Date;

  @Column({ name: 'idempotency_key', length: 180 })
  @BusinessColumn({
    label: 'Clé',
    description: 'Non exposé',
    importance: 'low',
    ignored: true,
  })
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
@BusinessTable({
  label: 'Contrôles de clôture',
  description:
    "Vérifications faites avant la clôture d'un dossier : statut, points bloquants, avertissements, justification, date du contrôle.",
  category: 'traitement',
  readOnly: true,
})
export class DossierClosureReview extends TenantEntity {
  @PrimaryGeneratedColumn('uuid')
  @BusinessColumn({
    label: 'Identifiant',
    description: 'Non exposé',
    importance: 'low',
    ignored: true,
  })
  id: string;

  @Column({ name: 'dossier_id', type: 'int' })
  @BusinessColumn({
    label: 'Dossier',
    description: 'Dossier contrôlé (dossiers.id)',
  })
  dossier_id: number;

  @Column({
    type: 'enum',
    enum: ClosureReviewStatus,
    default: ClosureReviewStatus.CHECKED,
  })
  status: ClosureReviewStatus;

  @Column({ type: 'json' })
  @BusinessColumn({
    label: 'Points bloquants',
    description: 'Éléments empêchant la clôture',
  })
  blockers: Array<Record<string, unknown>>;

  @Column({ type: 'json' })
  @BusinessColumn({ label: 'Avertissements', description: 'Points à vérifier' })
  warnings: Array<Record<string, unknown>>;

  @Column({ type: 'json', nullable: true })
  @BusinessColumn({
    label: 'Résolutions',
    description: 'Non exposé',
    importance: 'low',
    ignored: true,
  })
  resolutions: Array<Record<string, unknown>> | null;

  @Column({ type: 'text', nullable: true })
  @BusinessColumn({
    label: 'Justification',
    description: 'Justification de la clôture',
  })
  justification: string | null;

  @Column({ name: 'actor_user_id', type: 'int' })
  @BusinessColumn({
    label: 'Contrôlé par',
    description: 'Non exposé',
    importance: 'low',
    ignored: true,
  })
  actor_user_id: number;

  @Column({ name: 'checked_at', type: 'datetime' })
  @BusinessColumn({
    label: 'Contrôlé le',
    description: 'Date du contrôle',
    format: 'date',
  })
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
