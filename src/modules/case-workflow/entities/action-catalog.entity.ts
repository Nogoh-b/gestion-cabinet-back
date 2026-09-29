import { TenantEntity } from 'src/core/entities/tenant.entity';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ActionPriority, BillingCalculationMode } from '../case-workflow.enums';
import {
  BusinessColumn,
  BusinessTable,
} from 'src/core/decorators/business-metadata.decorator';

@Entity('case_action_families')
@BusinessTable({
  label: 'Familles d’actions',
  description: 'Regroupements fonctionnels du catalogue des actions du parcours dossier.',
  category: 'traitement',
  readOnly: true,
})
@Index('UQ_case_action_family_tenant_code', ['tenant_id', 'code'], {
  unique: true,
})
export class ActionFamily extends TenantEntity {
  @PrimaryGeneratedColumn('uuid')
  @BusinessColumn({ label: 'Identifiant de la famille', description: 'UUID technique de la famille d’actions.', importance: 'low', group: 'technique' })
  id: string;

  @Column({ length: 80 })
  @BusinessColumn({ label: 'Code de la famille', description: 'Code métier stable de la famille.', example: 'FORMALITES', importance: 'high', group: 'identification' })
  code: string;

  @Column({ length: 160 })
  @BusinessColumn({ label: 'Famille', description: 'Nom lisible de la famille d’actions.', example: 'Formalités', importance: 'critical', group: 'identification' })
  label: string;

  @Column({ type: 'text', nullable: true })
  @BusinessColumn({ label: 'Description', description: 'Description fonctionnelle de la famille.', importance: 'medium', group: 'identification' })
  description: string | null;

  @Column({ name: 'display_order', type: 'int', default: 0 })
  @BusinessColumn({ label: 'Ordre d’affichage', description: 'Position de la famille dans le catalogue.', importance: 'low', group: 'affichage' })
  display_order: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  @BusinessColumn({ label: 'Famille active', description: 'Indique si cette famille est encore proposée.', importance: 'medium', group: 'état' })
  is_active: boolean;
}

@Entity('case_action_definitions')
@BusinessTable({
  label: 'Définitions d’actions',
  description: 'Définitions versionnées des actions disponibles dans le parcours de traitement.',
  category: 'traitement',
  readOnly: true,
})
@Index('UQ_case_action_definition_version', ['tenant_id', 'code', 'version'], {
  unique: true,
})
@Index('IDX_case_action_definition_active', ['tenant_id', 'is_active'])
export class ActionDefinition extends TenantEntity {
  @PrimaryGeneratedColumn('uuid')
  @BusinessColumn({ label: 'Identifiant de la définition', description: 'UUID technique de cette version de définition.', importance: 'low', group: 'technique' })
  id: string;

  @Column({ name: 'family_id', type: 'varchar' })
  @BusinessColumn({ label: 'Famille d’actions', description: 'Identifiant de la famille à laquelle appartient la définition.', importance: 'medium', group: 'relation' })
  family_id: string;

  @ManyToOne(() => ActionFamily, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'family_id' })
  family: ActionFamily;

  @Column({ length: 100 })
  @BusinessColumn({ label: 'Code de l’action', description: 'Code métier stable partagé par les versions de la définition.', example: 'SIGN_DOCUMENT', importance: 'critical', group: 'identification' })
  code: string;

  @Column({ length: 200 })
  @BusinessColumn({ label: 'Libellé de l’action', description: 'Nom lisible proposé lors de la création d’une action.', example: 'Faire signer le document', importance: 'critical', group: 'identification' })
  label: string;

  @Column({ type: 'int', default: 1 })
  @BusinessColumn({ label: 'Version', description: 'Version de la définition d’action.', importance: 'medium', group: 'identification' })
  version: number;

  @Column({ name: 'specific_fields_schema', type: 'json', nullable: true })
  @BusinessColumn({ label: 'Champs spécifiques', description: 'Schéma des informations propres à ce type d’action.', importance: 'medium', group: 'configuration' })
  specific_fields_schema: Record<string, unknown> | null;

  @Column({ name: 'allowed_results', type: 'json', nullable: true })
  @BusinessColumn({ label: 'Résultats autorisés', description: 'Liste des résultats possibles à la clôture de l’action.', importance: 'medium', group: 'configuration' })
  allowed_results: Array<{ code: string; label: string }> | null;

  @Column({ name: 'required_relations', type: 'json', nullable: true })
  @BusinessColumn({ label: 'Relations requises', description: 'Documents, audiences ou actions devant être liés.', importance: 'medium', group: 'configuration' })
  required_relations: Record<string, unknown> | null;

  @Column({ name: 'default_due_days', type: 'int', nullable: true })
  @BusinessColumn({ label: 'Délai par défaut', description: 'Nombre de jours proposé pour l’échéance.', unit: 'jours', importance: 'medium', group: 'planification' })
  default_due_days: number | null;

  @Column({
    name: 'default_priority',
    type: 'enum',
    enum: ActionPriority,
    default: ActionPriority.NORMAL,
  })
  @BusinessColumn({ label: 'Priorité par défaut', description: 'Priorité proposée à la création : LOW, NORMAL, HIGH ou CRITICAL.', example: 'NORMAL', importance: 'medium', group: 'planification' })
  default_priority: ActionPriority;

  @Column({ name: 'is_required', type: 'boolean', default: false })
  @BusinessColumn({ label: 'Obligatoire par défaut', description: 'Indique si les nouvelles actions de ce type sont obligatoires par défaut.', importance: 'medium', group: 'configuration' })
  is_required: boolean;

  @Column({ name: 'billable_by_default', type: 'boolean', default: false })
  @BusinessColumn({ label: 'Facturable par défaut', description: 'Valeur proposée à la création seulement. Ne prouve pas qu’une action existante est à facturer : consulter dossier_actions.billing_decision.', importance: 'critical', group: 'facturation' })
  billable_by_default: boolean;

  @Column({
    name: 'billing_mode',
    type: 'enum',
    enum: BillingCalculationMode,
    nullable: true,
  })
  @BusinessColumn({ label: 'Mode de calcul par défaut', description: 'Mode tarifaire proposé : FIXED, HOURLY, PERCENTAGE ou EXPENSE.', example: 'FIXED', importance: 'high', group: 'facturation' })
  billing_mode: BillingCalculationMode | null;

  @Column({
    name: 'default_rate',
    type: 'decimal',
    precision: 14,
    scale: 2,
    nullable: true,
  })
  @BusinessColumn({ label: 'Tarif par défaut', description: 'Tarif proposé lorsque aucune règle plus spécifique au dossier ne s’applique.', format: 'currency', importance: 'high', group: 'facturation' })
  default_rate: number | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  @BusinessColumn({ label: 'Définition active', description: 'Indique si cette version peut encore être utilisée pour de nouvelles actions.', importance: 'medium', group: 'état' })
  is_active: boolean;
}
