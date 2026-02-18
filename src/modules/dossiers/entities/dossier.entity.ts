// src/modules/dossiers/entities/dossier.entity.ts
import { BaseEntity } from 'src/core/entities/baseEntity';
import { DossierStatus } from 'src/core/enums/dossier-status.enum';
import { Employee } from 'src/modules/agencies/employee/entities/employee.entity';
import { Audience, AudienceStatus } from 'src/modules/audiences/entities/audience.entity';
import { Customer } from 'src/modules/customer/customer/entities/customer.entity';
import { Diligence } from 'src/modules/diligence/entities/diligence.entity';
import { DocumentCustomer } from 'src/modules/documents/document-customer/entities/document-customer.entity';
import { StatutFacture } from 'src/modules/facture/dto/create-facture.dto';
import { Facture } from 'src/modules/facture/entities/facture.entity';
import { Jurisdiction } from 'src/modules/jurisdiction/entities/jurisdiction.entity';
import { ProcedureType } from 'src/modules/procedures/entities/procedure.entity';
import { Step, StepStatus } from 'src/modules/step/entities/step.entity';
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, JoinColumn, ManyToMany, JoinTable } from 'typeorm';





export enum DangerLevel {
  Faible = 0,
  Normal = 1,
  Eleve = 2,
  Critique = 3,
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

  @Column({ name: 'confidentiality_level',  default: 0 })
  confidentiality_level: number;

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

  @Column({ name: 'final_decision', type: 'text', nullable: true })
  final_decision: string;

  @Column({ name: 'appeal_possibility', type: 'boolean', default: false })
  appeal_possibility: boolean;

  @Column({ name: 'appeal_deadline', type: 'date', nullable: true })
  appeal_deadline: Date;

  @Column({ name: 'client_id', type: 'int', nullable: true })
  client_id?: number;

  @Column({ name: 'lawyer_id', type: 'int', nullable: true })
  lawyer_id?: number;

  @Column({ name: 'procedure_type_id', type: 'int', nullable: true })
  procedure_type_id?: number;

  @Column({ name: 'procedure_subtype_id', type: 'int', nullable: true })
  procedure_subtype_id?: number;

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

  get is_archived(): boolean {
    return this.status === DossierStatus.ARCHIVED;
  }

  get is_active(): boolean {
    return !this.is_closed && !this.is_archived;
  }

  get procedure_hierarchy(): string {
    return `${this.procedure_type.name} > ${this.procedure_subtype.name}`;
  }

  get client_full_name(): string {
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

  // Méthode pour changer le statut avec validation des transitions
  change_status(new_status: DossierStatus): void {
    const allowed_transitions: Record<DossierStatus, DossierStatus[]> = {
      [DossierStatus.OPEN]: [DossierStatus.AMICABLE, DossierStatus.LITIGATION],
      [DossierStatus.AMICABLE]: [DossierStatus.LITIGATION, DossierStatus.CLOSED],
      [DossierStatus.LITIGATION]: [DossierStatus.DECISION, DossierStatus.CLOSED],
      [DossierStatus.DECISION]: [DossierStatus.APPEAL, DossierStatus.CLOSED],
      [DossierStatus.APPEAL]: [DossierStatus.DECISION, DossierStatus.CLOSED],
      [DossierStatus.CLOSED]: [DossierStatus.ARCHIVED],
      [DossierStatus.ARCHIVED]: [] // Aucune transition depuis archivé
    };

    const current_transitions: DossierStatus[] = allowed_transitions[this.status] || [];
    
    if (!current_transitions.includes(new_status)) {
      throw new Error(`Transition non autorisée de ${this.status} vers ${new_status}`);
    }

    this.status = new_status;

    // Mettre à jour la date de clôture si nécessaire
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
}