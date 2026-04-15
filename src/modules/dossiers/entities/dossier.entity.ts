// src/modules/dossiers/entities/dossier.entity.ts
import { BaseEntity } from 'src/core/entities/baseEntity';
import { ClientDecision, DossierStatus, RecommendationType } from 'src/core/enums/dossier-status.enum';
import { Employee } from 'src/modules/agencies/employee/entities/employee.entity';
import { Audience, AudienceStatus } from 'src/modules/audiences/entities/audience.entity';
import { Conversation } from 'src/modules/chat/entities/conversation.entity';
import { Customer } from 'src/modules/customer/customer/entities/customer.entity';
import { Diligence } from 'src/modules/diligence/entities/diligence.entity';
import { DocumentCustomer } from 'src/modules/documents/document-customer/entities/document-customer.entity';
import { StatutFacture } from 'src/modules/facture/dto/create-facture.dto';
import { Facture } from 'src/modules/facture/entities/facture.entity';
import { Jurisdiction } from 'src/modules/jurisdiction/entities/jurisdiction.entity';
import { ProcedureType } from 'src/modules/procedures/entities/procedure.entity';
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, JoinColumn, ManyToMany, JoinTable, OneToOne, BeforeInsert } from 'typeorm';
import { Step, StepStatus } from './step.entity';
import { ProcedureInstance } from 'src/modules/procedure/entities/procedure-instance.entity';





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
  WON = 'won',        // Gagné
  LOST = 'lost',      // Perdu
  UNKNOWN = 'unknown', // Inconnu (par défaut) 
  SETTLED = 'settled', // Transaction/Arrangement à l'amiable
  ABANDONED = 'abandoned' // Abandonné par le client
}


@Entity('dossiers')
export class Dossier extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'dossier_number', length: 50, unique: true, nullable: false })
  dossier_number: string;

  @Column({ type: 'text', nullable: false })
  object: string;

  @Column({ nullable: true, default: 1 })
  jurisdiction_id?: number | null;

  @Column({ name: 'danger_level', type: 'enum', enum: DangerLevel, default: DangerLevel.Normal })
  danger_level: DangerLevel;

  @Column({ name: 'court_name', length: 255, nullable: true })
  court_name: string;

  @Column({ name: 'case_number', length: 100, nullable: true })
  case_number: string;

  @Column({ name: 'opposing_party_name', length: 255, nullable: true })
  opposing_party_name: string;

  @Column({ name: 'opposing_party_lawyer', length: 255, nullable: true })
  opposing_party_lawyer: string;

  @Column({ name: 'opposing_party_contact', type: 'text', nullable: true })
  opposing_party_contact: string;

  @Column({ name: 'third_parties', type: 'text', nullable: true })
  third_parties: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'boolean', default: false })
  is_archived?: boolean;

  @Column({ name: 'initial_request', type: 'text', nullable: true })
  initial_request: string;

  @Column({ 
    type: 'enum', 
    enum: DossierStatus, 
    default: DossierStatus.OPEN 
  })
  status: DossierStatus;

  @Column({ name: 'opening_date', type: 'date', nullable: false })
  opening_date: Date;

  @Column({ name: 'closing_date', type: 'date', nullable: true })
  closing_date: Date;

  @Column({ name: 'estimated_duration', type: 'int', nullable: true })
  estimated_duration: number;

  @Column({ name: 'confidentiality_level',  default: false })
  confidentiality_level: boolean;

  @Column({ name: 'priority_level', type: 'int', default: 0 })
  priority_level: number;

  @Column({ name: 'budget_estimate', type: 'decimal', precision: 10, scale: 2, nullable: true })
  budget_estimate: number;

  @Column({ name: 'actual_costs', type: 'decimal', precision: 10, scale: 2, default: 0 })
  actual_costs: number;

  @Column({ name: 'success_probability', type: 'int', nullable: true })
  success_probability: number;

  @Column({ name: 'key_dates', type: 'json', nullable: true })
  key_dates: {
    event: string;
    date: string;
    completed: boolean;
  }[];

  @Column({ name: 'next_steps', type: 'text', nullable: true })
  next_steps: string;

  @Column({ name: 'conversation_id', type: 'int', nullable: true })
  conversation_id?: number;

  @Column({ name: 'final_decision', type: 'text', nullable: true })
  final_decision: string | null;

  @Column({ name: 'appeal_decision', type: 'text', nullable: true })
  appeal_decision : string | null;  
  
  @Column({ name: 'remand_jurisdiction', type: 'text', nullable: true })
  remand_jurisdiction : string | null; 

  @Column({ name: 'first_instance_decision', type: 'text', nullable: true })
  first_instance_decision : string | null;

  @Column({ name: 'appeal_possibility', type: 'boolean', default: false })
  appeal_possibility: boolean;

  @Column({ name: 'appeal_deadline', type: 'date', nullable: true })
  appeal_deadline: Date | null;

  @Column({ name: 'client_id', type: 'int', nullable: true })
  client_id?: number;

  @Column({ name: 'lawyer_id', type: 'int', nullable: true })
  lawyer_id?: number;

  @Column({ name: 'procedure_type_id', type: 'int', nullable: true })
  procedure_type_id?: number;

  @Column({ name: 'procedure_subtype_id', type: 'int', nullable: true })
  procedure_subtype_id?: number;

    @Column({ 
    name: 'client_decision', 
    type: 'enum', 
    enum: ClientDecision, 
    nullable: true 
  })
  client_decision: ClientDecision;

  @Column({ 
    name: 'recommendation', 
    type: 'enum', 
    enum: RecommendationType, 
    nullable: true 
  })
  recommendation: RecommendationType;

  @Column({ 
    name: 'analysis_date', 
    type: 'date', 
    nullable: true 
  })
  analysis_date: Date;

  @Column({ 
    name: 'analysis_notes', 
    type: 'text', 
    nullable: true 
  })
  analysis_notes: string;

  @Column({ 
    name: 'appeal_filed', 
    type: 'boolean', 
    default: false 
  })
  appeal_filed: boolean;

   @Column({ 
    name: 'cassation_possibility', 
    type: 'boolean', 
    default: false 
  })
  cassation_possibility: boolean;

    @Column({ 
    name: 'current_decision_type', 
    type: 'enum', 
    enum: ['FIRST_INSTANCE', 'APPEAL', 'CASSATION'],
    nullable: true 
  })
  current_decision_type?: 'FIRST_INSTANCE' | 'APPEAL' | 'CASSATION' | null;

  @Column({ 
    name: 'cassation_deadline', 
    type: 'date', 
    nullable: true 
  })
  cassation_deadline: Date | null;

  @Column({ 
    name: 'cassation_filed', 
    type: 'boolean', 
    default: false 
  })
  cassation_filed: boolean;

  @Column({ 
    name: 'execution_date', 
    type: 'date', 
    nullable: true 
  })
  execution_date: Date;


  // Dans l'entité Dossier, ajoutez :
@Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
settlement_amount?: number | null;
@Column({ type: 'text', nullable: true })
settlement_terms?: string | null;

@Column({ 
  name: 'client_satisfaction', 
  type: 'enum', 
  enum: ClientSatisfaction, 
  default: ClientSatisfaction.NEUTRAL 
})
client_satisfaction: ClientSatisfaction;

@Column({ 
  name: 'outcome', 
  type: 'enum', 
  enum: DossierOutcome, 
  default: DossierOutcome.UNKNOWN 
})
outcome: DossierOutcome;

@Column({ 
  name: 'outcome_date', 
  type: 'date', 
  nullable: true 
})
outcome_date: Date;

@Column({ 
  name: 'outcome_notes', 
  type: 'text', 
  nullable: true 
})
outcome_notes: string;

@Column({ 
  name: 'damages_awarded', 
  type: 'decimal', 
  precision: 12, 
  scale: 2, 
  nullable: true 
})
damages_awarded: number; // Montant des dommages et intérêts si gagné

@Column({ 
  name: 'costs_awarded', 
  type: 'decimal', 
  precision: 12, 
  scale: 2, 
  nullable: true 
})
costs_awarded: number; // Dépens/montant accordé

  // Relations principales (obligatoires selon R1)
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

  // Relations avec les autres entités
  @OneToMany(() => DocumentCustomer, (document) => document.dossier)
  documents: DocumentCustomer[];

  @OneToMany(() => Audience, (audience) => audience.dossier)
  audiences: Audience[];

  @OneToMany(() => Facture, (facture) => facture.dossier)
  factures: Facture[];

  @OneToMany(() => Diligence, (diligence) => diligence.dossier)
  diligence: Diligence[];
  
  @OneToOne(() => Conversation, conversation => conversation.dossier)
  @JoinColumn({ name: 'conversation_id' })
  conversation: Conversation;


//   @OneToMany(() => Comment, (comment) => comment.dossier)
//   comments: Comment[];

  // Collaborateurs supplémentaires (autres avocats, secrétaires)
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
      .filter(facture => facture.status === StatutFacture.PAYEE)
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
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] || null;
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

  @BeforeInsert()
  beforeCreate() {
    this.is_archived = this.is_archived ?? false;
  }

}