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
import {
  BusinessColumn,
  BusinessTable,
} from 'src/core/decorators/business-metadata.decorator';

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
  @BusinessColumn({ label: 'Identifiant de l’action', description: 'UUID technique utilisé pour relier l’action à un élément facturable.', importance: 'low', group: 'technique' })
  id: string;

  @Column({ name: 'dossier_id', type: 'int' })
  @BusinessColumn({ label: 'Dossier', description: 'Identifiant technique du dossier auquel appartient l’action.', importance: 'critical', group: 'relation' })
  dossier_id: number;

  @Column({ name: 'definition_id', type: 'varchar' })
  @BusinessColumn({ label: 'Définition d’action', description: 'Identifiant de la définition versionnée de l’action.', importance: 'medium', group: 'relation' })
  definition_id: string;

  @ManyToOne(() => ActionDefinition, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'definition_id' })
  definition: ActionDefinition;

  @Column({ name: 'definition_code', length: 100 })
  @BusinessColumn({ label: 'Code de l’action', description: 'Code métier stable de la définition d’action.', example: 'SIGN_DOCUMENT', importance: 'high', group: 'identification' })
  definition_code: string;

  @Column({ name: 'definition_label', length: 200 })
  @BusinessColumn({ label: 'Libellé de l’action', description: 'Libellé métier de la définition au moment de la création de l’action.', example: 'Faire signer le document', importance: 'critical', group: 'identification' })
  definition_label: string;

  @Column({ name: 'definition_version', type: 'int' })
  @BusinessColumn({ label: 'Version de la définition', description: 'Version de la définition utilisée pour cette action.', importance: 'low', group: 'technique' })
  definition_version: number;

  @Column({ length: 255 })
  @BusinessColumn({ label: 'Titre', description: 'Titre lisible et éventuellement personnalisé de l’action.', example: 'Faire signer le document', importance: 'critical', group: 'identification' })
  title: string;

  @Column({ name: 'responsible_user_id', type: 'int', nullable: true })
  @BusinessColumn({ label: 'Responsable', description: 'Identifiant de l’utilisateur responsable. Joindre user.id pour afficher son prénom et son nom.', importance: 'high', group: 'relation' })
  responsible_user_id: number | null;

  @Column({
    type: 'enum',
    enum: DossierActionStatus,
    default: DossierActionStatus.TODO,
  })
  @BusinessColumn({ label: 'État d’avancement', description: 'État réel de l’action : TODO=à faire, IN_PROGRESS=en cours, ON_HOLD=en attente, COMPLETED=terminée, CANCELLED=annulée. COMPLETED ne signifie jamais à lui seul que l’action est facturable.', example: 'COMPLETED', importance: 'critical', group: 'état' })
  status: DossierActionStatus;

  @Column({
    type: 'enum',
    enum: ActionPriority,
    default: ActionPriority.NORMAL,
  })
  @BusinessColumn({ label: 'Priorité', description: 'Priorité opérationnelle : LOW, NORMAL, HIGH ou CRITICAL.', example: 'NORMAL', importance: 'medium', group: 'planification' })
  priority: ActionPriority;

  @Column({ name: 'is_required', type: 'boolean', default: false })
  @BusinessColumn({ label: 'Action obligatoire', description: 'Vrai si l’action est obligatoire dans le parcours du dossier.', importance: 'medium', group: 'planification' })
  is_required: boolean;

  @Column({ name: 'planned_at', type: 'datetime', nullable: true })
  @BusinessColumn({ label: 'Date planifiée', description: 'Date prévue de réalisation.', format: 'date', importance: 'medium', group: 'planification' })
  planned_at: Date | null;

  @Column({ name: 'due_at', type: 'datetime', nullable: true })
  @BusinessColumn({ label: 'Échéance', description: 'Date limite de réalisation.', format: 'date', importance: 'high', group: 'planification' })
  due_at: Date | null;

  @Column({ name: 'remind_at', type: 'datetime', nullable: true })
  @BusinessColumn({ label: 'Date de rappel', description: 'Date prévue pour rappeler l’action.', format: 'date', importance: 'medium', group: 'planification' })
  remind_at: Date | null;

  @Column({ name: 'reminder_sent_at', type: 'datetime', nullable: true })
  @BusinessColumn({ label: 'Rappel envoyé le', description: 'Date d’envoi effectif du rappel.', format: 'date', importance: 'low', group: 'planification' })
  reminder_sent_at: Date | null;

  @Column({ name: 'started_at', type: 'datetime', nullable: true })
  @BusinessColumn({ label: 'Commencée le', description: 'Date de démarrage effectif de l’action.', format: 'date', importance: 'medium', group: 'exécution' })
  started_at: Date | null;

  @Column({ name: 'completed_at', type: 'datetime', nullable: true })
  @BusinessColumn({ label: 'Terminée le', description: 'Date d’achèvement de l’action. Cette date ne prouve pas que l’action est à facturer.', format: 'date', importance: 'high', group: 'exécution' })
  completed_at: Date | null;

  @Column({ name: 'cancelled_at', type: 'datetime', nullable: true })
  @BusinessColumn({ label: 'Annulée le', description: 'Date d’annulation de l’action.', format: 'date', importance: 'medium', group: 'exécution' })
  cancelled_at: Date | null;

  @Column({ name: 'result_code', type: 'varchar', length: 100, nullable: true })
  @BusinessColumn({ label: 'Code du résultat', description: 'Code du résultat choisi lors de la clôture de l’action.', importance: 'medium', group: 'résultat' })
  result_code: string | null;

  @Column({ name: 'result_notes', type: 'text', nullable: true })
  @BusinessColumn({ label: 'Notes de résultat', description: 'Observations saisies à la clôture de l’action.', importance: 'medium', group: 'résultat' })
  result_notes: string | null;

  @Column({ name: 'duration_minutes', type: 'int', nullable: true })
  @BusinessColumn({ label: 'Durée', description: 'Temps réellement consacré à l’action, en minutes.', unit: 'minutes', importance: 'high', group: 'exécution' })
  duration_minutes: number | null;

  @Column({ name: 'specific_data', type: 'json', nullable: true })
  @BusinessColumn({ label: 'Données spécifiques', description: 'Valeurs propres au type d’action, utilisées notamment par certaines règles tarifaires.', importance: 'medium', group: 'résultat' })
  specific_data: Record<string, unknown> | null;

  @Column({
    name: 'billing_decision',
    type: 'enum',
    enum: ActionBillingDecision,
    default: ActionBillingDecision.NOT_DECIDED,
  })
  @BusinessColumn({ label: 'Décision de facturation', description: 'Décision explicite : BILLABLE=à facturer, NON_BILLABLE=non facturable, NOT_DECIDED=aucune décision, NEEDS_REVIEW=à vérifier. Seule la valeur BILLABLE autorise à présenter l’action comme « à facturer ».', example: 'BILLABLE', importance: 'critical', group: 'facturation' })
  billing_decision: ActionBillingDecision;

  @Column({ name: 'billing_reason', type: 'text', nullable: true })
  @BusinessColumn({ label: 'Motif de facturation', description: 'Justification de la décision de facturation ou du besoin de vérification.', importance: 'high', group: 'facturation' })
  billing_reason: string | null;

  @Column({
    name: 'source_recommendation_id',
    type: 'varchar',
    length: 36,
    nullable: true,
  })
  @BusinessColumn({ label: 'Recommandation source', description: 'Identifiant de la recommandation ayant créé l’action.', importance: 'low', group: 'relation' })
  source_recommendation_id: string | null;

  @Column({
    name: 'idempotency_key',
    type: 'varchar',
    length: 180,
    nullable: true,
  })
  @BusinessColumn({ label: 'Clé d’idempotence', description: 'Clé technique empêchant la création en double.', importance: 'low', group: 'technique', ignored: true })
  idempotency_key: string | null;

  @VersionColumn({ name: 'lock_version', type: 'int' })
  @BusinessColumn({ label: 'Version technique', description: 'Compteur de verrouillage optimiste.', importance: 'low', group: 'technique', ignored: true })
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
  @BusinessColumn({ label: 'Identifiant du lien', description: 'UUID technique du lien action-document.', importance: 'low', group: 'technique' })
  id: string;

  @Column({ name: 'action_id', type: 'varchar' })
  @BusinessColumn({ label: 'Action', description: 'Identifiant de l’action concernée.', importance: 'critical', group: 'relation' })
  action_id: string;

  @ManyToOne(() => DossierAction, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'action_id' })
  action: DossierAction;

  @Column({ name: 'document_id', type: 'int' })
  @BusinessColumn({ label: 'Document', description: 'Identifiant du document lié.', importance: 'critical', group: 'relation' })
  document_id: number;

  @Column({ type: 'enum', enum: ActionLinkRole })
  @BusinessColumn({ label: 'Rôle du document', description: 'INPUT=entrée, OUTPUT=production, EVIDENCE=preuve.', example: 'EVIDENCE', importance: 'high', group: 'relation' })
  role: ActionLinkRole;

  @Column({ name: 'requires_review', type: 'boolean', default: false })
  @BusinessColumn({ label: 'Vérification requise', description: 'Indique si le document lié doit être contrôlé.', importance: 'medium', group: 'état' })
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
  @BusinessColumn({ label: 'Identifiant du lien', description: 'UUID technique du lien action-audience.', importance: 'low', group: 'technique' })
  id: string;

  @Column({ name: 'action_id', type: 'varchar' })
  @BusinessColumn({ label: 'Action', description: 'Identifiant de l’action concernée.', importance: 'critical', group: 'relation' })
  action_id: string;

  @ManyToOne(() => DossierAction, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'action_id' })
  action: DossierAction;

  @Column({ name: 'audience_id', type: 'int' })
  @BusinessColumn({ label: 'Audience', description: 'Identifiant de l’audience liée.', importance: 'critical', group: 'relation' })
  audience_id: number;

  @Column({ type: 'enum', enum: ActionLinkRole })
  @BusinessColumn({ label: 'Rôle de l’audience', description: 'Rôle joué par l’audience dans l’exécution de l’action.', importance: 'high', group: 'relation' })
  role: ActionLinkRole;

  @Column({ name: 'requires_review', type: 'boolean', default: false })
  @BusinessColumn({ label: 'Vérification requise', description: 'Indique si l’audience liée doit être contrôlée.', importance: 'medium', group: 'état' })
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
  @BusinessColumn({ label: 'Identifiant de la relation', description: 'UUID technique de la relation entre actions.', importance: 'low', group: 'technique' })
  id: string;

  @Column({ name: 'action_id', type: 'varchar' })
  @BusinessColumn({ label: 'Action', description: 'Identifiant de l’action principale.', importance: 'critical', group: 'relation' })
  action_id: string;

  @ManyToOne(() => DossierAction, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'action_id' })
  action: DossierAction;

  @Column({ name: 'related_action_id', type: 'varchar' })
  @BusinessColumn({ label: 'Action liée', description: 'Identifiant de l’autre action concernée.', importance: 'critical', group: 'relation' })
  related_action_id: string;

  @ManyToOne(() => DossierAction, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'related_action_id' })
  related_action: DossierAction;

  @Column({
    type: 'enum',
    enum: ActionLinkRole,
    default: ActionLinkRole.DEPENDS_ON,
  })
  @BusinessColumn({ label: 'Type de relation', description: 'Nature du lien entre les actions, notamment DEPENDS_ON pour une dépendance.', example: 'DEPENDS_ON', importance: 'high', group: 'relation' })
  role: ActionLinkRole;
}
