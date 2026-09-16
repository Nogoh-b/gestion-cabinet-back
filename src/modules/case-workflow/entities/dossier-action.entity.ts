import { TenantEntity } from 'src/core/entities/tenant.entity';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  VersionColumn,
} from 'typeorm';
import {
  ActionBillingDecision,
  ActionLinkRole,
  ActionPriority,
  DossierActionStatus,
} from '../case-workflow.enums';
import { ActionDefinition } from './action-catalog.entity';
import { BusinessTable } from 'src/core/decorators/business-metadata.decorator';

@Entity('dossier_actions')
@BusinessTable({
  label: 'Actions des dossiers',
  description: 'Actions de traitement planifiées, en cours, terminées ou annulées dans les dossiers.',
  category: 'traitement',
  readOnly: true,
})
@Index('IDX_dossier_action_workspace', ['tenant_id', 'dossier_id', 'status'])
@Index('UQ_dossier_action_idempotency', ['tenant_id', 'idempotency_key'], {
  unique: true,
})
@Index(
  'UQ_dossier_action_source_recommendation',
  ['tenant_id', 'source_recommendation_id'],
  { unique: true },
)
export class DossierAction extends TenantEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'dossier_id', type: 'int' })
  dossier_id: number;

  @Column({ name: 'definition_id', type: 'varchar', length: 36 })
  definition_id: string;

  @ManyToOne(() => ActionDefinition, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'definition_id' })
  definition: ActionDefinition;

  @Column({ name: 'definition_code', length: 100 })
  definition_code: string;

  @Column({ name: 'definition_label', length: 200 })
  definition_label: string;

  @Column({ name: 'definition_version', type: 'int' })
  definition_version: number;

  @Column({ length: 255 })
  title: string;

  @Column({ name: 'responsible_user_id', type: 'int', nullable: true })
  responsible_user_id: number | null;

  @Column({
    type: 'enum',
    enum: DossierActionStatus,
    default: DossierActionStatus.TODO,
  })
  status: DossierActionStatus;

  @Column({
    type: 'enum',
    enum: ActionPriority,
    default: ActionPriority.NORMAL,
  })
  priority: ActionPriority;

  @Column({ name: 'is_required', type: 'boolean', default: false })
  is_required: boolean;

  @Column({ name: 'planned_at', type: 'datetime', nullable: true })
  planned_at: Date | null;

  @Column({ name: 'due_at', type: 'datetime', nullable: true })
  due_at: Date | null;

  @Column({ name: 'remind_at', type: 'datetime', nullable: true })
  remind_at: Date | null;

  @Column({ name: 'reminder_sent_at', type: 'datetime', nullable: true })
  reminder_sent_at: Date | null;

  @Column({ name: 'started_at', type: 'datetime', nullable: true })
  started_at: Date | null;

  @Column({ name: 'completed_at', type: 'datetime', nullable: true })
  completed_at: Date | null;

  @Column({ name: 'cancelled_at', type: 'datetime', nullable: true })
  cancelled_at: Date | null;

  @Column({ name: 'result_code', type: 'varchar', length: 100, nullable: true })
  result_code: string | null;

  @Column({ name: 'result_notes', type: 'text', nullable: true })
  result_notes: string | null;

  @Column({ name: 'duration_minutes', type: 'int', nullable: true })
  duration_minutes: number | null;

  @Column({ name: 'specific_data', type: 'json', nullable: true })
  specific_data: Record<string, unknown> | null;

  @Column({
    name: 'billing_decision',
    type: 'enum',
    enum: ActionBillingDecision,
    default: ActionBillingDecision.NOT_DECIDED,
  })
  billing_decision: ActionBillingDecision;

  @Column({ name: 'billing_reason', type: 'text', nullable: true })
  billing_reason: string | null;

  @Column({
    name: 'source_recommendation_id',
    type: 'varchar',
    length: 36,
    nullable: true,
  })
  source_recommendation_id: string | null;

  @Column({
    name: 'idempotency_key',
    type: 'varchar',
    length: 180,
    nullable: true,
  })
  idempotency_key: string | null;

  @VersionColumn({ name: 'lock_version', type: 'int' })
  lock_version: number;
}

@Entity('dossier_action_document_links')
@BusinessTable({
  label: 'Documents liés aux actions',
  description: 'Documents utilisés, produits ou conservés comme preuve pour une action de dossier.',
  category: 'traitement',
  readOnly: true,
})
@Index(
  'UQ_action_document_role',
  ['tenant_id', 'action_id', 'document_id', 'role'],
  { unique: true },
)
export class DossierActionDocumentLink extends TenantEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'action_id', type: 'varchar', length: 36 })
  action_id: string;

  @ManyToOne(() => DossierAction, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'action_id' })
  action: DossierAction;

  @Column({ name: 'document_id', type: 'int' })
  document_id: number;

  @Column({ type: 'enum', enum: ActionLinkRole })
  role: ActionLinkRole;

  @Column({ name: 'requires_review', type: 'boolean', default: false })
  requires_review: boolean;
}

@Entity('dossier_action_audience_links')
@BusinessTable({
  label: 'Audiences liées aux actions',
  description: 'Audiences utilisées ou produites dans le cadre d’une action de dossier.',
  category: 'traitement',
  readOnly: true,
})
@Index(
  'UQ_action_audience_role',
  ['tenant_id', 'action_id', 'audience_id', 'role'],
  { unique: true },
)
export class DossierActionAudienceLink extends TenantEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'action_id', type: 'varchar', length: 36 })
  action_id: string;

  @ManyToOne(() => DossierAction, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'action_id' })
  action: DossierAction;

  @Column({ name: 'audience_id', type: 'int' })
  audience_id: number;

  @Column({ type: 'enum', enum: ActionLinkRole })
  role: ActionLinkRole;

  @Column({ name: 'requires_review', type: 'boolean', default: false })
  requires_review: boolean;
}

@Entity('dossier_action_relations')
@BusinessTable({
  label: 'Dépendances entre actions',
  description: 'Relations de dépendance entre les actions successives d’un dossier.',
  category: 'traitement',
  readOnly: true,
})
@Index(
  'UQ_action_relation_role',
  ['tenant_id', 'action_id', 'related_action_id', 'role'],
  { unique: true },
)
export class DossierActionRelation extends TenantEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'action_id', type: 'varchar', length: 36 })
  action_id: string;

  @ManyToOne(() => DossierAction, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'action_id' })
  action: DossierAction;

  @Column({ name: 'related_action_id', type: 'varchar', length: 36 })
  related_action_id: string;

  @ManyToOne(() => DossierAction, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'related_action_id' })
  related_action: DossierAction;

  @Column({
    type: 'enum',
    enum: ActionLinkRole,
    default: ActionLinkRole.DEPENDS_ON,
  })
  role: ActionLinkRole;
}
