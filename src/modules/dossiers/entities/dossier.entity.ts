import { BusinessTable, BusinessColumn } from 'src/core/decorators/business-metadata.decorator';
import { TenantEntity as BaseEntity } from 'src/core/entities/tenant.entity';
import { ClientDecision, DossierStatus, RecommendationType } from 'src/core/enums/dossier-status.enum';
import { Employee } from 'src/modules/agencies/employee/entities/employee.entity';
import { Audience, AudienceStatus } from 'src/modules/audiences/entities/audience.entity';
import { Conversation } from 'src/modules/chat/entities/conversation.entity';
import { Customer } from 'src/modules/customer/customer/entities/customer.entity';
import { Diligence } from 'src/modules/diligence/entities/diligence.entity';
import { DocumentCustomer } from 'src/modules/documents/document-customer/entities/document-customer.entity';
import { Facture } from 'src/modules/facture/entities/facture.entity';
import { Jurisdiction } from 'src/modules/jurisdiction/entities/jurisdiction.entity';
import { ProcedureInstance } from 'src/modules/procedure/entities/procedure-instance.entity';
import { ProcedureType } from 'src/modules/procedures/entities/procedure.entity';
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, JoinColumn, ManyToMany, JoinTable, OneToOne, BeforeInsert, AfterLoad, Index } from 'typeorm';

import { Step, StepStatus } from './step.entity';


export enum DangerLevel {
  Faible = 0,
  Normal = 1,
  Eleve = 2,
  Critique = 3,
}

export enum ClientSatisfaction {
  VERY_SATISFIED = 'very_satisfied',
  SATISFIED = 'satisfied',
  NEUTRAL = 'neutral',
  DISSATISFIED = 'dissatisfied',
  VERY_DISSATISFIED = 'very_dissatisfied'
}

export enum DossierOutcome {
  WON = 'won',
  LOST = 'lost',
  UNKNOWN = 'unknown',
  SETTLED = 'settled',
  ABANDONED = 'abandoned'
}

@Entity('dossiers')
// Unicité du numéro de dossier PAR cabinet (multi-tenant), pas globale :
// deux cabinets peuvent tous deux avoir "DOS-2026-0001". La génération du
// numéro (generateDossierNumber) est déjà scopée par tenant_id.
@Index('UQ_dossiers_tenant_dossier_number', ['tenant_id', 'dossier_number'], { unique: true })
@BusinessTable({
  label: 'Dossiers contentieux',
  description: 'Gestion complète des dossiers juridiques du cabinet. Les statuts sont stockés en codes numériques BD; utiliser status=8 pour clôturé, status=9 pour archivé, status=10 pour abandonné.',
  icon: '⚖️',
  category: 'dossier',
  ignored : false
})
export class Dossier extends BaseEntity {
  /**
   * Propriété TRANSIENT (pas un @Column) — passée par le service create()
   * depuis CreateDossierDto.notify_client, lue par le DossierSubscriber
   * dans onAfterCreate pour décider si on envoie un e-mail au client.
   * Non persistée en base.
   */
  notify_client?: boolean;

  @PrimaryGeneratedColumn()
  @BusinessColumn({
    label: 'Identifiant technique',
    description: 'Numéro unique généré automatiquement par le système',
    importance: 'low',
    group: 'technique',
    ignored: true
  })
  id: number;

  @Column({ name: 'dossier_number', length: 50, nullable: false })
  @BusinessColumn({
    label: 'Numéro de dossier',
    description: 'Numéro unique d\'identification du dossier (format: ANN/XXX/YY).L\'identifiant unique d\'un dossier est "dossier_number" (jamais "id" pour la recherche). Il doit etre utiliser pour la recherche ( par le bot ) pas id',
    example: '2025/001/01',
    importance: 'critical',
    group: 'identification'
  })
  dossier_number: string;

  @Column({ type: 'text', nullable: false })
  @BusinessColumn({
    label: 'Objet du litige',
    description: 'Description synthétique de l\'affaire et de son contexte',
    example: 'Litige commercial fournisseur X pour non-paiement de factures d\'un montant de 50 000€',
    importance: 'critical',
    group: 'contenu'
  })
  object: string;

  @Column({ nullable: true, default: 1 })
  @BusinessColumn({
    label: 'Juridiction',
    description: 'Identifiant de la juridiction saisie (tribunal compétent)',
    importance: 'high',
    group: 'localisation'
  })
  jurisdiction_id?: number | null;

  @Column({ name: 'danger_level', type: 'enum', enum: DangerLevel, default: DangerLevel.Normal })
  @BusinessColumn({
    label: "Niveau d'urgence",
    description: 'BD: 0=Faible, 1=Normal, 2=Eleve, 3=Critique. En SQL utiliser le nombre.',
    example: '2 = Élevé',
    importance: 'high',
    group: 'priorité'
  })
  danger_level: DangerLevel;

  @Column({ name: 'court_name', length: 255, nullable: true })
  @BusinessColumn({
    label: 'Nom du tribunal',
    description: 'Nom officiel du tribunal saisi',
    example: 'Tribunal judiciaire de Paris',
    importance: 'high',
    group: 'localisation'
  })
  court_name: string;

  @Column({ name: 'case_number', length: 100, nullable: true })
  @BusinessColumn({
    label: 'Numéro de rôle / RG',
    description: 'Numéro d\'enregistrement officiel auprès du tribunal',
    example: 'RG 25/00123',
    importance: 'high',
    group: 'identification'
  })
  case_number: string;

  @Column({ name: 'opposing_party_name', length: 255, nullable: true })
  @BusinessColumn({
    label: 'Partie adverse',
    description: 'Nom de la personne ou entité adverse dans le litige',
    example: 'SARL Dupont et Fils',
    importance: 'critical',
    group: 'parties'
  })
  opposing_party_name: string;

  @Column({ name: 'opposing_party_lawyer', length: 255, nullable: true })
  @BusinessColumn({
    label: 'Avocat adverse',
    description: 'Cabinet d\'avocats représentant la partie adverse',
    example: 'Cabinet Martin & Associés',
    importance: 'high',
    group: 'parties'
  })
  opposing_party_lawyer: string;

  @Column({ name: 'opposing_party_contact', type: 'text', nullable: true })
  @BusinessColumn({
    label: 'Contact partie adverse',
    description: 'Coordonnées du représentant de la partie adverse',
    importance: 'medium',
    group: 'parties',
    sensitive: true
  })
  opposing_party_contact: string;

  @Column({ name: 'third_parties', type: 'text', nullable: true })
  @BusinessColumn({
    label: 'Tiers impliqués',
    description: 'Autres parties ou intervenants dans le litige',
    importance: 'medium',
    group: 'parties'
  })
  third_parties: string;

  @Column({ type: 'text', nullable: true })
  @BusinessColumn({
    label: 'Description détaillée',
    description: 'Description complète du contexte, des enjeux et des antécédents',
    importance: 'high',
    group: 'contenu'
  })
  description: string;

  @Column({ type: 'boolean', default: false })
  @BusinessColumn({
    label: 'Archivé',
    description: 'True = dossier archivé (plus actif), False = dossier actif',
    importance: 'low',
    group: 'état'
  })
  is_archived?: boolean;

  @Column({ name: 'initial_request', type: 'text', nullable: true })
  @BusinessColumn({
    label: 'Demande initiale',
    description: 'Prétentions et demandes formulées par le client à l\'ouverture',
    importance: 'high',
    group: 'contenu'
  })
  initial_request: string;

  @Column({ 
    type: 'enum', 
    enum: DossierStatus, 
    default: DossierStatus.OPEN 
  })
  @BusinessColumn({
    label: 'Statut du dossier',
    description: 'BD: 0=OPEN/ouvert, 1=PRELIMINARY_ANALYSIS/analyse, 2=AMICABLE/amiable, 3=LITIGATION/contentieux, 4=JUDGMENT/jugement, 5=APPEAL/appel, 6=CASSATION, 7=EXECUTION, 8=CLOSED/clôturé, 9=ARCHIVED/archivé, 10=ABANDONED/abandonné.',
    example: 'status = 8 pour les dossiers clôturés',
    importance: 'critical',
    group: 'état'
  })
  status: DossierStatus;

  @Column({ name: 'opening_date', type: 'date', nullable: false })
  @BusinessColumn({
    label: "Date d'ouverture",
    description: 'Date de création/ouverture officielle du dossier',
    format: 'date',
    importance: 'high',
    group: 'dates'
  })
  opening_date: Date;

  @Column({ name: 'closing_date', type: 'date', nullable: true })
  @BusinessColumn({
    label: 'Date de clôture',
    description: 'Date de clôture définitive du dossier',
    format: 'date',
    importance: 'high',
    group: 'dates'
  })
  closing_date: Date;

  @Column({ name: 'estimated_duration', type: 'int', nullable: true })
  @BusinessColumn({
    label: 'Durée estimée',
    description: 'Durée prévisionnelle du traitement en jours',
    unit: 'jours',
    importance: 'medium',
    group: 'planification'
  })
  estimated_duration: number;

  @Column({ name: 'confidentiality_level', default: false })
  @BusinessColumn({
    label: 'Niveau de confidentialité',
    description: 'True = dossier confidentiel (accès restreint)',
    importance: 'high',
    group: 'sécurité'
  })
  confidentiality_level: boolean;

  @Column({ name: 'priority_level', type: 'int', default: 0 })
  @BusinessColumn({
    label: 'Niveau de priorité',
    description: '0=Normale, 1=Haute, 2=Prioritaire, 3=Urgent absolu',
    importance: 'high',
    group: 'priorité'
  })
  priority_level: number;

  @Column({ name: 'budget_estimate', type: 'decimal', precision: 10, scale: 2, nullable: true })
  @BusinessColumn({
    label: 'Budget estimé',
    description: 'Montant estimé des honoraires pour le dossier',
    unit: '€',
    format: 'currency',
    importance: 'high',
    group: 'financier'
  })
  budget_estimate: number;

  // @Column({ name: 'actual_costs', type: 'decimal', precision: 10, scale: 2, default: 0 })
  // @BusinessColumn({
  //   label: 'Coûts réels',
  //   description: 'Montant réel des honoraires engagés',
  //   unit: '€',
  //   format: 'currency',
  //   importance: 'high',
  //   group: 'financier'
  // })
  actual_costs: number;

  @Column({ name: 'success_probability', type: 'int', nullable: true })
  @BusinessColumn({
    label: 'Probabilité de succès',
    description: 'Estimation des chances de gagner le dossier (0-100%)',
    unit: '%',
    format: 'percentage',
    importance: 'high',
    group: 'analyse'
  })
  success_probability: number;

  @Column({ name: 'key_dates', type: 'json', nullable: true })
  @BusinessColumn({
    label: 'Dates clés',
    description: 'Liste des événements importants avec leurs dates',
    importance: 'medium',
    group: 'dates'
  })
  key_dates: {
    event: string;
    date: string;
    completed: boolean;
  }[];

  @Column({ name: 'next_steps', type: 'text', nullable: true })
  @BusinessColumn({
    label: 'Prochaines étapes',
    description: 'Description des actions à venir sur le dossier',
    importance: 'high',
    group: 'planification'
  })
  next_steps: string;

  @Column({ name: 'conversation_id', type: 'int', nullable: true })
  @BusinessColumn({
    label: 'Conversation associée',
    description: 'Identifiant de la conversation de suivi',
    importance: 'low',
    group: 'communication'
  })
  conversation_id?: number;

  @Column({ name: 'final_decision', type: 'text', nullable: true })
  @BusinessColumn({
    label: 'Décision finale',
    description: 'Décision rendue par la juridiction',
    importance: 'critical',
    group: 'résultat'
  })
  final_decision: string | null;

  @Column({ name: 'appeal_decision', type: 'text', nullable: true })
  @BusinessColumn({
    label: 'Décision en appel',
    description: 'Décision rendue par la cour d\'appel',
    importance: 'high',
    group: 'résultat'
  })
  appeal_decision: string | null;  

  @Column({ name: 'remand_jurisdiction', type: 'text', nullable: true })
  @BusinessColumn({
    label: 'Juridiction de renvoi',
    description: 'Juridiction saisie après cassation',
    importance: 'medium',
    group: 'localisation'
  })
  remand_jurisdiction: string | null;

  @Column({ name: 'first_instance_decision', type: 'text', nullable: true })
  @BusinessColumn({
    label: 'Décision première instance',
    description: 'Décision rendue en première instance',
    importance: 'high',
    group: 'résultat'
  })
  first_instance_decision: string | null;

  @Column({ name: 'appeal_possibility', type: 'boolean', default: false })
  @BusinessColumn({
    label: 'Possibilité d\'appel',
    description: 'True = le jugement peut faire l\'objet d\'un appel',
    importance: 'high',
    group: 'voies de recours'
  })
  appeal_possibility: boolean;

  @Column({ name: 'appeal_deadline', type: 'date', nullable: true })
  @BusinessColumn({
    label: 'Date limite appel',
    description: 'Dernier jour pour interjeter appel',
    format: 'date',
    importance: 'high',
    group: 'voies de recours'
  })
  appeal_deadline: Date | null;

    @Column({ name: 'client_id', type: 'int', nullable: false })
  @BusinessColumn({
    label: 'Client',
    description: 'Identifiant du client propriétaire du dossier',
    importance: 'critical',
    group: 'parties'
  })
  client_id: number;

    @Column({ name: 'lawyer_id', type: 'int', nullable: false })
  @BusinessColumn({
    label: 'Avocat référent',
    description: 'Identifiant de l\'avocat en charge',
    importance: 'critical',
    group: 'parties'
  })
  lawyer_id: number;

    @Column({ name: 'procedure_type_id', type: 'int', nullable: false })
  @BusinessColumn({
    label: 'Type de procédure',
    description: 'Identifiant du type de procédure',
    importance: 'high',
    group: 'procédure'
  })
  procedure_type_id: number;

  @Column({ name: 'procedure_subtype_id', type: 'int', nullable: false })
  @BusinessColumn({
    label: 'Sous-type de procédure',
    description: 'Identifiant du sous-type de procédure',
    importance: 'medium',
    group: 'procédure'
  })
  procedure_subtype_id: number;

  @Column({ 
    name: 'client_decision', 
    type: 'enum', 
    enum: ClientDecision, 
    nullable: true 
  })
  @BusinessColumn({
    label: 'Décision du client',
    description: "BD: 'transaction', 'contentieux', 'abandon'.",
    importance: 'critical',
    group: 'décision'
  })
  client_decision: ClientDecision;

  @Column({ 
    name: 'recommendation', 
    type: 'enum', 
    enum: RecommendationType, 
    nullable: true 
  })
  @BusinessColumn({
    label: 'Recommandation du cabinet',
    description: "BD: 'transaction', 'present_options', 'procedure'.",
    importance: 'high',
    group: 'conseil'
  })
  recommendation: RecommendationType;

  @Column({ 
    name: 'analysis_date', 
    type: 'date', 
    nullable: true 
  })
  @BusinessColumn({
    label: "Date d'analyse",
    description: 'Date de réalisation de l\'analyse préliminaire',
    format: 'date',
    importance: 'medium',
    group: 'dates'
  })
  analysis_date: Date;

  @Column({ 
    name: 'analysis_notes', 
    type: 'text', 
    nullable: true 
  })
  @BusinessColumn({
    label: "Notes d'analyse",
    description: 'Commentaires détaillés de l\'analyse préliminaire',
    importance: 'high',
    group: 'analyse'
  })
  analysis_notes: string;

  @Column({ 
    name: 'appeal_filed', 
    type: 'boolean', 
    default: false 
  })
  @BusinessColumn({
    label: 'Appel interjeté',
    description: 'True = un appel a été déposé',
    importance: 'high',
    group: 'voies de recours'
  })
  appeal_filed: boolean;

  @Column({ 
    name: 'cassation_possibility', 
    type: 'boolean', 
    default: false 
  })
  @BusinessColumn({
    label: 'Possibilité de cassation',
    description: 'True = un pourvoi en cassation peut être formé',
    importance: 'medium',
    group: 'voies de recours'
  })
  cassation_possibility: boolean;

  @Column({ 
    name: 'current_decision_type', 
    type: 'enum', 
    enum: ['FIRST_INSTANCE', 'APPEAL', 'CASSATION'],
    nullable: true 
  })
  @BusinessColumn({
    label: 'Type de décision actuelle',
    description: "BD: 'FIRST_INSTANCE', 'APPEAL', 'CASSATION'.",
    importance: 'high',
    group: 'état'
  })
  current_decision_type?: 'FIRST_INSTANCE' | 'APPEAL' | 'CASSATION' | null;

  @Column({ 
    name: 'cassation_deadline', 
    type: 'date', 
    nullable: true 
  })
  @BusinessColumn({
    label: 'Date limite cassation',
    description: 'Dernier jour pour former un pourvoi en cassation',
    format: 'date',
    importance: 'high',
    group: 'voies de recours'
  })
  cassation_deadline: Date | null;

  @Column({ 
    name: 'cassation_filed', 
    type: 'boolean', 
    default: false 
  })
  @BusinessColumn({
    label: 'Cassation déposée',
    description: 'True = un pourvoi en cassation a été déposé',
    importance: 'high',
    group: 'voies de recours'
  })
  cassation_filed: boolean;

  @Column({ 
    name: 'execution_date', 
    type: 'date', 
    nullable: true 
  })
  @BusinessColumn({
    label: "Date d'exécution",
    description: 'Date de mise en œuvre de la décision judiciaire',
    format: 'date',
    importance: 'medium',
    group: 'dates'
  })
  execution_date: Date;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  @BusinessColumn({
    label: 'Montant de la transaction',
    description: 'Montant convenu en cas de transaction amiable',
    unit: '€',
    format: 'currency',
    importance: 'high',
    group: 'financier'
  })
  settlement_amount?: number | null;

  @Column({ type: 'text', nullable: true })
  @BusinessColumn({
    label: 'Termes de la transaction',
    description: 'Conditions détaillées de l\'accord transactionnel',
    importance: 'high',
    group: 'résultat'
  })
  settlement_terms?: string | null;

  @Column({ 
    name: 'client_satisfaction', 
    type: 'enum', 
    enum: ClientSatisfaction, 
    default: ClientSatisfaction.NEUTRAL 
  })
  @BusinessColumn({
    label: 'Satisfaction client',
    description: "BD: 'very_satisfied', 'satisfied', 'neutral', 'dissatisfied', 'very_dissatisfied'.",
    importance: 'high',
    group: 'relation client'
  })
  client_satisfaction: ClientSatisfaction;

  @Column({ 
    name: 'outcome', 
    type: 'enum', 
    enum: DossierOutcome, 
    default: DossierOutcome.UNKNOWN 
  })
  @BusinessColumn({
    label: 'Issue du dossier',
    description: "'won'=Gagné, 'lost'=Perdu, 'unknown'=Inconnu, 'settled'=Transaction, 'abandoned'=Abandonné",
    importance: 'critical',
    group: 'résultat'
  })
  outcome: DossierOutcome;

  @Column({ 
    name: 'outcome_date', 
    type: 'date', 
    nullable: true 
  })
  @BusinessColumn({
    label: "Date de l'issue",
    description: 'Date de la décision finale ou de la transaction',
    format: 'date',
    importance: 'high',
    group: 'dates'
  })
  outcome_date: Date;

  @Column({ 
    name: 'outcome_notes', 
    type: 'text', 
    nullable: true 
  })
  @BusinessColumn({
    label: "Notes sur l'issue",
    description: 'Commentaires sur le résultat du dossier',
    importance: 'medium',
    group: 'résultat'
  })
  outcome_notes: string;

  @Column({ 
    name: 'damages_awarded', 
    type: 'decimal', 
    precision: 12, 
    scale: 2, 
    nullable: true 
  })
  @BusinessColumn({
    label: 'Dommages et intérêts',
    description: 'Montant accordé au client si le dossier est gagné',
    unit: '€',
    format: 'currency',
    importance: 'high',
    group: 'financier'
  })
  damages_awarded: number;

  @Column({ 
    name: 'costs_awarded', 
    type: 'decimal', 
    precision: 12, 
    scale: 2, 
    nullable: true 
  })
  @BusinessColumn({
    label: 'Dépens accordés',
    description: "Montant des frais de justice accordés à l'article 700",
    unit: '€',
    format: 'currency',
    importance: 'medium',
    group: 'financier'
  })
  costs_awarded: number;

  // ==================== RELATIONS ====================

  @ManyToOne(() => Customer, { nullable: false })
  @JoinColumn({ name: 'client_id' })
  client: Customer;

  @ManyToOne(() => Employee, { nullable: false })
  @JoinColumn({ name: 'lawyer_id' })
  lawyer: Employee;

  @ManyToOne(() => ProcedureType, { nullable: false })
  @JoinColumn({ name: 'procedure_type_id' })
  procedure_type: ProcedureType;

  @ManyToOne(() => Jurisdiction, { nullable: true })
  @JoinColumn({ name: 'jurisdiction_id' })
  jurisdiction?: Jurisdiction | null;

  @ManyToOne(() => ProcedureType, { nullable: false })
  @JoinColumn({ name: 'procedure_subtype_id' })
  procedure_subtype: ProcedureType;

  @OneToMany(() => Diligence, (diligence) => diligence.dossier)
  diligences: Diligence[];

  @OneToMany(() => DocumentCustomer, (document) => document.dossier)
  documents: DocumentCustomer[];

  @OneToMany(() => Audience, (audience) => audience.dossier)
  audiences: Audience[];

  @OneToMany(() => Facture, (facture) => facture.dossier)
  factures: Facture[];

  @OneToOne(() => Conversation, conversation => conversation.dossier)
  @JoinColumn({ name: 'conversation_id' })
  conversation: Conversation;

  @ManyToMany(() => Employee, user => user.collaborating_dossiers)
  @JoinTable({
    name: 'dossier_collaborators',
    joinColumn: { name: 'dossier_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'user_id', referencedColumnName: 'id' }
  })
  collaborators: Employee[];

  @OneToOne(() => ProcedureInstance)
  @JoinColumn({ name: 'procedureInstanceId' })
  procedureInstance: ProcedureInstance;

  @Column({ nullable: true })
  procedureInstanceId: string;

  @OneToMany(() => Step, step => step.dossier)
  steps: Step[];

  // ==================== GETTERS MÉTIER ====================

  // Méthode utilitaire pour récupérer l'étape courante
  getCurrentStep(): Step | null {
    if (!this.steps) return null;
    return this.steps.find(step => 
      step.status === StepStatus.IN_PROGRESS
    ) || null;
  }

  // Getters
  get is_closed(): boolean {
    return this.status === DossierStatus.CLOSED || this.status === DossierStatus.ARCHIVED;
  }

  // get is_archived(): boolean {
  //   return this.status === DossierStatus.ARCHIVED;
  // }

  get is_active(): boolean {
    return !this.is_closed && !this.is_archived;
  }

  get procedure_hierarchy(): string {
    return `${this.procedure_type.name} > ${this.procedure_subtype.name}`;
  }

  get full_name(): string {
    return this.client?.full_name || '';
  }

  get lawyer_full_name(): string {
    return this.lawyer?.full_name || '';
  }

  get total_factures_amount(): number {
    if (!this.factures) return 0;
    return this.factures.reduce((total, facture) => total + parseFloat(facture.montantTTC.toString()), 0);
  }

  get paid_factures_amount(): number {
    if (!this.factures) return 0;
    return this.factures
      // .filter(facture => facture.status === StatutFacture.PAYEE)
      .reduce((total, facture) => total + parseFloat(facture.montantTTC.toString()), 0);
  }



  get document_count(): number {
    return this.documents?.length || 0;
  }

  get audience_count(): number {
    return this.audiences?.length || 0;
  }

  performPreliminaryAnalysis(successProbability: number, dangerLevel: DangerLevel, notes: string): void {
    this.success_probability = successProbability;
    this.danger_level = dangerLevel;
    this.analysis_notes = notes;
    this.analysis_date = new Date();
    this.status = DossierStatus.PRELIMINARY_ANALYSIS;
    
    // Générer la recommandation
    this.recommendation = this.generateRecommendation();
  }

  // Générer la recommandation basée sur les critères
  private generateRecommendation(): RecommendationType {
    if (this.success_probability < 30) {
      return RecommendationType.TRANSACTION;
    } else if (this.success_probability >= 30 && this.success_probability <= 70) {
      return RecommendationType.PRESENT_OPTIONS;
    } else {
      return RecommendationType.PROCEDURE;
    }
  }

  // Choisir la décision du client
  chooseClientDecision(decision: ClientDecision): void {
    this.client_decision = decision;
    
    switch (decision) {
      case ClientDecision.TRANSACTION:
        this.status = DossierStatus.AMICABLE;
        break;
      case ClientDecision.CONTENTIEUX:
        this.status = DossierStatus.LITIGATION;
        break;
      case ClientDecision.ABANDON:
        this.status = DossierStatus.ABANDONED;
        this.closing_date = new Date();
        break;
    }
  }

  // Enregistrer le jugement
  registerJudgment(decision: string, isSatisfied: boolean): void {
    this.final_decision = decision;
    this.status = DossierStatus.JUDGMENT;
    
    if (!isSatisfied) {
      this.appeal_possibility = true;
      // Calculer la date limite d'appel (généralement 1 mois)
      const appealDeadline = new Date();
      appealDeadline.setMonth(appealDeadline.getMonth() + 1);
      this.appeal_deadline = appealDeadline;
    }
  }

  // Interjeter appel
  fileAppeal(): void {
    if (!this.appeal_possibility && this.status !== DossierStatus.JUDGMENT) {
      throw new Error('L\'appel n\'est pas possible pour ce dossier');
    }
    
    this.status = DossierStatus.APPEAL;
    this.appeal_filed = true;
  }

  // Former pourvoi en cassation
  fileCassation(): void {
    if (this.status !== DossierStatus.APPEAL) {
      throw new Error('La cassation n\'est possible qu\'après un appel');
    }
    
    this.status = DossierStatus.CASSATION;
    this.cassation_filed = true;
  }

  // Exécuter la décision
  executeDecision(): void {
    if (this.status !== DossierStatus.JUDGMENT && this.status !== DossierStatus.APPEAL && this.status !== DossierStatus.CASSATION) {
      throw new Error('Aucune décision à exécuter');
    }
    
    this.status = DossierStatus.EXECUTION;
    this.execution_date = new Date();
  }

  // Clôturer le dossier
  close(): void {
    if (this.status !== DossierStatus.EXECUTION && 
        this.status !== DossierStatus.AMICABLE && 
        this.status !== DossierStatus.ABANDONED) {
      throw new Error('Le dossier ne peut pas être clôturé dans son état actuel');
    }
    
    this.status = DossierStatus.CLOSED;
    this.closing_date = new Date();
  }

  // Override de la méthode change_status existante
  change_status(new_status: DossierStatus): void {
    const allowed_transitions: Record<DossierStatus, DossierStatus[]> = {
      [DossierStatus.PRELIMINARY_ANALYSIS]: [DossierStatus.AMICABLE, DossierStatus.LITIGATION, DossierStatus.ABANDONED],
      [DossierStatus.AMICABLE]: [DossierStatus.CLOSED],
      [DossierStatus.LITIGATION]: [DossierStatus.JUDGMENT, DossierStatus.CLOSED],
      [DossierStatus.JUDGMENT]: [DossierStatus.APPEAL, DossierStatus.EXECUTION, DossierStatus.CLOSED],
      [DossierStatus.APPEAL]: [DossierStatus.JUDGMENT, DossierStatus.CASSATION, DossierStatus.CLOSED],
      [DossierStatus.CASSATION]: [DossierStatus.JUDGMENT, DossierStatus.CLOSED],
      [DossierStatus.EXECUTION]: [DossierStatus.CLOSED],
      [DossierStatus.CLOSED]: [DossierStatus.ARCHIVED],
      [DossierStatus.ARCHIVED]: [],
      [DossierStatus.OPEN]: [DossierStatus.PRELIMINARY_ANALYSIS],
      [DossierStatus.ABANDONED]: [DossierStatus.CLOSED],
    };

    const current_transitions: DossierStatus[] = allowed_transitions[this.status] || [];
    
    if (!current_transitions.includes(new_status)) {
      throw new Error(`Transition non autorisée de ${this.status} vers ${new_status}`);
    }

    this.status = new_status;

    if (new_status === DossierStatus.CLOSED || new_status === DossierStatus.ARCHIVED) {
      this.closing_date = new Date();
    }
  }

  get next_audience(): Audience | null {
    if (!this.audiences || this.audiences.length === 0) return null;
    
    const upcoming = this.audiences
      .filter(audience => audience.status === AudienceStatus.SCHEDULED && audience.is_upcoming)
      .sort((a, b) => a.full_datetime.getTime() - b.full_datetime.getTime());
    
    return upcoming.length > 0 ? upcoming[0] : null;
  }

  get past_audiences(): Audience[] {
    if (!this.audiences || this.audiences.length === 0) return [];
    
    return this.audiences
      .filter(audience => audience.is_past || audience.status === AudienceStatus.HELD)
      .sort((a, b) => b.full_datetime.getTime() - a.full_datetime.getTime());
  }

  get scheduled_audiences(): Audience[] {
    if (!this.audiences || this.audiences.length === 0) return [];
    
    return this.audiences
      .filter(audience => audience.status === AudienceStatus.SCHEDULED)
      .sort((a, b) => a.full_datetime.getTime() - b.full_datetime.getTime());
  }

  // Dans class Dossier

/**
 * Étape actuellement en cours (la première trouvée avec status IN_PROGRESS)
 */
get currentStep(): Step | null {
  if (!this.steps || this.steps.length === 0) return null;
  
  // On prend généralement la plus récente en IN_PROGRESS
  // ou la première selon ton workflow
  return this.steps
    .filter(s => s.status === StepStatus.IN_PROGRESS)
    .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())[0] || null;
}

/**
 * Nombre total d'étapes
 */
get stepCount(): number {
  return this.steps?.length || 0;
}

/**
 * Nombre d'étapes terminées ou annulées
 */
get completedStepCount(): number {
  if (!this.steps) return 0;
  return this.steps.filter(s => 
    s.status === StepStatus.COMPLETED || 
    s.status === StepStatus.CANCELLED
  ).length;
}

/**
 * Pourcentage global d'avancement (basé sur les étapes terminées)
 */
get stepsProgress(): number {
  const total = this.stepCount;
  if (total === 0) return 0;
  
  const completed = this.completedStepCount;
  return Math.round((completed / total) * 100);
}

/**
 * Résumé structuré des étapes (prêt pour le DTO)
 */
get stepsSummary(): {
  current_step_title?: string;
  current_step_type?: string;
  current_step_status?: number;
  total_steps: number;
  completed_steps: number;
  progress: number;
} {
  const current = this.currentStep;

  return {
    current_step_title: current?.title,
    current_step_type: current?.type,
    current_step_status: current?.status,
    total_steps: this.stepCount,
    completed_steps: this.completedStepCount,
    progress: this.stepsProgress,
  };
}

// Dans la classe Dossier
get is_won(): boolean {
  return this.outcome === DossierOutcome.WON;
}

get is_lost(): boolean {
  return this.outcome === DossierOutcome.LOST;
}

get has_outcome(): boolean {
  return this.outcome !== DossierOutcome.UNKNOWN && 
         this.outcome !== undefined;
}

// Méthode pour définir le résultat
setOutcome(outcome: DossierOutcome, notes?: string, damages?: number): void {
  this.outcome = outcome;
  this.outcome_date = new Date();
  if (notes) this.outcome_notes = notes;
  if (damages) this.damages_awarded = damages;
  
  // Si le dossier est gagné ou perdu, on peut le clôturer
  if (outcome === DossierOutcome.WON || outcome === DossierOutcome.LOST) {
    this.status = DossierStatus.CLOSED;
    this.closing_date = new Date();
  }
}

  /**
   * Recompute actual_costs from loaded factures.
   * Called automatically by TypeORM after every SELECT that returns a Dossier.
   * Falls back to the stored column value when factures are not eager-loaded.
   */
  @AfterLoad()
  computeActualCosts(): void {
    if (Array.isArray(this.factures) && this.factures.length > 0) {
      this.actual_costs = this.factures.reduce(
        (sum, f) => sum + Number(f.montantTTC ?? 0),
        0,
      );
    }
  }

  @BeforeInsert()
  beforeCreate() {
    this.is_archived = this.is_archived ?? false;
  }
}
