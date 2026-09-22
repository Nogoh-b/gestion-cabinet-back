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
import {
  BusinessColumn,
  BusinessTable,
} from 'src/core/decorators/business-metadata.decorator';

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

  @Column({ name: 'action_definition_id', type: 'varchar' })
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
  @BusinessColumn({ label: 'Identifiant de la recommandation', description: 'UUID technique de la recommandation.', importance: 'low', group: 'technique' })
  id: string;

  @Column({ name: 'dossier_id', type: 'int' })
  @BusinessColumn({ label: 'Dossier', description: 'Identifiant du dossier concerné.', importance: 'critical', group: 'relation' })
  dossier_id: number;

  @Column({ name: 'rule_id', type: 'varchar', length: 36, nullable: true })
  @BusinessColumn({ label: 'Règle source', description: 'Identifiant de la règle ayant produit la recommandation.', importance: 'low', group: 'relation' })
  rule_id: string | null;

  @Column({ name: 'rule_code', length: 100 })
  @BusinessColumn({ label: 'Code de la règle', description: 'Code métier de la règle de recommandation.', importance: 'medium', group: 'origine' })
  rule_code: string;

  @Column({ name: 'rule_version', type: 'int' })
  @BusinessColumn({ label: 'Version de la règle', description: 'Version de la règle utilisée.', importance: 'low', group: 'origine' })
  rule_version: number;

  @Column({ name: 'action_definition_id', type: 'varchar' })
  @BusinessColumn({ label: 'Action recommandée', description: 'Identifiant de la définition de l’action proposée.', importance: 'critical', group: 'relation' })
  action_definition_id: string;

  @ManyToOne(() => ActionDefinition, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'action_definition_id' })
  action_definition: ActionDefinition;

  @Column({ type: 'text' })
  @BusinessColumn({ label: 'Motif', description: 'Explication métier de la recommandation.', importance: 'critical', group: 'recommandation' })
  reason: string;

  @Column({
    type: 'enum',
    enum: RecommendationStatus,
    default: RecommendationStatus.ACTIVE,
  })
  @BusinessColumn({ label: 'État de la recommandation', description: 'ACTIVE=proposée, DEFERRED=reportée, ACCEPTED=convertie en action, SUPERSEDED=remplacée, DISMISSED=écartée.', example: 'ACTIVE', importance: 'critical', group: 'état' })
  status: RecommendationStatus;

  @Column({ type: 'int', default: 0 })
  @BusinessColumn({ label: 'Score', description: 'Score de priorité calculé pour classer les recommandations.', importance: 'high', group: 'recommandation' })
  score: number;

  @Column({ name: 'due_at', type: 'datetime', nullable: true })
  @BusinessColumn({ label: 'Échéance suggérée', description: 'Date proposée pour réaliser l’action.', format: 'date', importance: 'high', group: 'planification' })
  due_at: Date | null;

  @Column({ name: 'remind_at', type: 'datetime', nullable: true })
  @BusinessColumn({ label: 'Rappel suggéré', description: 'Date proposée pour le rappel.', format: 'date', importance: 'medium', group: 'planification' })
  remind_at: Date | null;

  @Column({ name: 'context_snapshot', type: 'json', nullable: true })
  @BusinessColumn({ label: 'Contexte de la recommandation', description: 'Instantané des faits ayant conduit à la recommandation.', importance: 'medium', group: 'recommandation' })
  context_snapshot: Record<string, unknown> | null;

  @Column({ name: 'source_event_key', length: 180 })
  @BusinessColumn({ label: 'Évènement source', description: 'Clé technique de l’évènement déclencheur.', importance: 'low', group: 'technique', ignored: true })
  source_event_key: string;

  @VersionColumn({ name: 'lock_version', type: 'int' })
  @BusinessColumn({ label: 'Version technique', description: 'Compteur de verrouillage optimiste.', importance: 'low', group: 'technique', ignored: true })
  lock_version: number;
}
