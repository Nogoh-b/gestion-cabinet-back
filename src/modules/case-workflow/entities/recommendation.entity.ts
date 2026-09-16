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
  RecommendationStatus,
  RecommendationTrigger,
} from '../case-workflow.enums';
import { ActionDefinition } from './action-catalog.entity';
import { BusinessTable } from 'src/core/decorators/business-metadata.decorator';

@Entity('case_recommendation_rules')
@Index(
  'UQ_case_recommendation_rule_version',
  ['tenant_id', 'code', 'version'],
  { unique: true },
)
export class RecommendationRule extends TenantEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100 })
  code: string;

  @Column({ length: 200 })
  label: string;

  @Column({ type: 'int', default: 1 })
  version: number;

  @Column({ type: 'enum', enum: RecommendationTrigger })
  trigger: RecommendationTrigger;

  @Column({ name: 'condition_json', type: 'json' })
  condition_json: Record<string, unknown>;

  @Column({ name: 'action_definition_id', type: 'varchar', length: 36 })
  action_definition_id: string;

  @ManyToOne(() => ActionDefinition, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'action_definition_id' })
  action_definition: ActionDefinition;

  @Column({ name: 'reason_template', type: 'text' })
  reason_template: string;

  @Column({ type: 'int', default: 0 })
  priority: number;

  @Column({ type: 'int', default: 0 })
  specificity: number;

  @Column({ name: 'due_offset_days', type: 'int', nullable: true })
  due_offset_days: number | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  is_active: boolean;
}

@Entity('dossier_recommendations')
@BusinessTable({
  label: 'Recommandations des dossiers',
  description: 'Actions recommandées, différées ou traitées pour chaque dossier.',
  category: 'traitement',
  readOnly: true,
})
@Index('IDX_dossier_recommendation_current', [
  'tenant_id',
  'dossier_id',
  'status',
])
@Index(
  'UQ_dossier_recommendation_event',
  ['tenant_id', 'source_event_key', 'rule_version'],
  { unique: true },
)
export class DossierRecommendation extends TenantEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'dossier_id', type: 'int' })
  dossier_id: number;

  @Column({ name: 'rule_id', type: 'varchar', length: 36, nullable: true })
  rule_id: string | null;

  @Column({ name: 'rule_code', length: 100 })
  rule_code: string;

  @Column({ name: 'rule_version', type: 'int' })
  rule_version: number;

  @Column({ name: 'action_definition_id', type: 'varchar', length: 36 })
  action_definition_id: string;

  @ManyToOne(() => ActionDefinition, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'action_definition_id' })
  action_definition: ActionDefinition;

  @Column({ type: 'text' })
  reason: string;

  @Column({
    type: 'enum',
    enum: RecommendationStatus,
    default: RecommendationStatus.ACTIVE,
  })
  status: RecommendationStatus;

  @Column({ type: 'int', default: 0 })
  score: number;

  @Column({ name: 'due_at', type: 'datetime', nullable: true })
  due_at: Date | null;

  @Column({ name: 'remind_at', type: 'datetime', nullable: true })
  remind_at: Date | null;

  @Column({ name: 'context_snapshot', type: 'json', nullable: true })
  context_snapshot: Record<string, unknown> | null;

  @Column({ name: 'source_event_key', length: 180 })
  source_event_key: string;

  @VersionColumn({ name: 'lock_version', type: 'int' })
  lock_version: number;
}
