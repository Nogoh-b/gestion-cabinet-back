import { BusinessTable, BusinessColumn } from 'src/core/decorators/business-metadata.decorator';
import { TenantEntity as BaseEntity } from 'src/core/entities/tenant.entity';
import { DossierStatus } from 'src/core/enums/dossier-status.enum';
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
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, JoinColumn, ManyToMany, JoinTable, OneToOne, AfterLoad, Unique } from 'typeorm';

import { DossierMember } from './dossier-member.entity';


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

export enum ConflictCheckStatus {
  PENDING = 'PENDING',
  CLEARED = 'CLEARED',
  WAIVED = 'WAIVED',
  BLOCKED = 'BLOCKED',
}

@Entity('dossiers')
@Unique(['tenant_id', 'dossier_number'])
@BusinessTable({
  label: 'Dossiers contentieux',
  description: 'Gestion des dossiers juridiques. Le statut décrit uniquement le cycle de vie administratif ; le déroulement procédural provient de l’instance.',
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
    default: DossierStatus.DRAFT,
  })
  @BusinessColumn({
    label: 'Statut du dossier',
    description: 'Cycle administratif : DRAFT, ACTIVE, CLOSED ou ARCHIVED.',
    example: 'ACTIVE',
    importance: 'critical',
    group: 'état'
  })
  status: DossierStatus;

  @Column({
    name: 'conflict_check_status',
    type: 'enum',
    enum: ConflictCheckStatus,
    default: ConflictCheckStatus.PENDING,
  })
  conflict_check_status: ConflictCheckStatus;

  @Column({ name: 'conflict_check_notes', type: 'text', nullable: true })
  conflict_check_notes?: string | null;

  @Column({ name: 'engagement_document_id', type: 'int', nullable: true })
  engagement_document_id?: number | null;

  @Column({ name: 'financial_terms_confirmed', type: 'boolean', default: false })
  financial_terms_confirmed: boolean;

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
  closing_date: Date | null;

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

  @OneToMany(() => DossierMember, (member) => member.dossier)
  members: DossierMember[];

  @OneToOne(() => ProcedureInstance)
  @JoinColumn({ name: 'procedureInstanceId' })
  procedureInstance: ProcedureInstance;

  @Column({ nullable: true })
  procedureInstanceId: string | null;

  // ==================== GETTERS MÉTIER ====================

  // Getters
  get is_closed(): boolean {
    return this.status === DossierStatus.CLOSED || this.status === DossierStatus.ARCHIVED;
  }

  // get is_archived(): boolean {
  //   return this.status === DossierStatus.ARCHIVED;
  // }

  get is_active(): boolean {
    return this.status === DossierStatus.ACTIVE;
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

  // Transition du seul cycle de vie administratif.
  change_status(new_status: DossierStatus): void {
    const allowed_transitions: Record<DossierStatus, DossierStatus[]> = {
      [DossierStatus.DRAFT]: [DossierStatus.ACTIVE],
      [DossierStatus.ACTIVE]: [DossierStatus.CLOSED],
      [DossierStatus.CLOSED]: [DossierStatus.ACTIVE, DossierStatus.ARCHIVED],
      [DossierStatus.ARCHIVED]: [],
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
  
  // La clôture reste une commande explicite, soumise aux préconditions métier.
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

}
