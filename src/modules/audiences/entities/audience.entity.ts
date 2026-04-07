// src/modules/audiences/entities/audience.entity.ts
import { BaseEntity } from 'src/core/entities/baseEntity';
import { AudienceType } from 'src/modules/audience-type/entities/audience-type.entity';
import { DocumentCustomer } from 'src/modules/documents/document-customer/entities/document-customer.entity';
import { Dossier } from 'src/modules/dossiers/entities/dossier.entity';
import { Step } from 'src/modules/dossiers/entities/step.entity';
import { Jurisdiction } from 'src/modules/jurisdiction/entities/jurisdiction.entity';
import { ProcedureInstance } from 'src/modules/procedure/entities/procedure-instance.entity';
import { Stage } from 'src/modules/procedure/entities/stage.entity';
import { SubStageVisit } from 'src/modules/procedure/entities/sub-stage-visit.entity';
import { SubStage } from 'src/modules/procedure/entities/sub-stage.entity';
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, ManyToMany, JoinTable } from 'typeorm';





export enum AudienceStatus {
  SCHEDULED = 0,
  HELD = 1,
  POSTPONED = 2,
  CANCELLED = 3,
}

export enum AudienceType1 {
  HEARING = 0,
  DELIBERATION = 1,
  JUDGMENT = 2,
  CONCILIATION = 3,
}

@Entity('audiences')
export class Audience extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'audience_date', type: 'date', nullable: false }) // ✅ Changé en 'date'
  audience_date: Date;

  @Column({ name: 'dossier_id', type: 'int', nullable: true }) // ✅ Changé en 'date'
  dossier_id: string;

  @Column({ name: 'audience_time', length: 10, nullable: false })
  audience_time: string;

  @Column({  nullable: false , default: 1})
  jurisdiction_id: number;

  @Column({ name: 'room', length: 50, nullable: true })
  room: string;

  @Column({ 
    type: 'enum', 
    enum: AudienceType1, 
    default: AudienceType1.HEARING 
  })
  type: AudienceType1;

  @Column({ 
    type: 'enum', 
    enum: AudienceStatus, 
    default: AudienceStatus.SCHEDULED 
  })
  status: AudienceStatus;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @ManyToOne(() => Step, step => step.audiences, { nullable: true })
  @JoinColumn({ name: 'step_id' })
  step: Step;

  @Column({ name: 'step_id', type: 'int', nullable: true })
  step_id: number;

  @Column({ name: 'decision', type: 'text', nullable: true })
  decision: string;

  @Column({ name: 'postponed_to', type: 'date', nullable: true }) // ✅ Changé en 'date'
  postponed_to: Date;

  @Column({ name: 'reminder_sent', default: false })
  reminder_sent: boolean;

  @Column({ name: 'reminder_sent_at', type: 'timestamp', nullable: true })
  reminder_sent_at: Date;

  @Column({ name: 'duration_minutes', type: 'int', nullable: true })
  duration_minutes: number;

  @Column({ name: 'judge_name', length: 255, nullable: true })
  judge_name: string;

  @Column({  nullable: true , default: 1})
  audience_type_id: number;

  @Column({ name: 'outcome', length: 100, nullable: true })
  outcome: string; // 'favorable', 'unfavorable', 'partial', 'postponed'

  // Relations
  @ManyToOne(() => Dossier, (dossier) => dossier.audiences, { nullable: false })
  @JoinColumn({ name: 'dossier_id' })
  dossier: Dossier;

  @ManyToOne(() => Jurisdiction, (jurisdiction) => jurisdiction.audiences, { nullable: false })
  @JoinColumn({ name: 'jurisdiction_id' })
  jurisdiction: Jurisdiction;  

  @ManyToOne(() => AudienceType, (audienceType) => audienceType.audiences, { nullable: true })
  @JoinColumn({ name: 'audience_type_id' })
  audience_type: AudienceType;

  @ManyToMany(() => DocumentCustomer, (document) => document.audiences, {
    cascade: true, // facultatif, selon si tu veux créer les documents via audience
  })
  @JoinTable({
    name: 'audience_documents', // nom de la table pivot
    joinColumn: { name: 'audience_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'document_id', referencedColumnName: 'id' },
  })
  documents: DocumentCustomer[];

  @Column({ name: 'sub_stage_id', type: 'varchar', nullable: true })
  sub_stage_id: string;

  // @Column({ name: 'stage_id', type: 'varchar', nullable: true })
  // stage_id: string;

  @Column({ name: 'sub_stage_visit_id', type: 'varchar', nullable: true })
  sub_stage_visit_id: string;

  @ManyToOne(() => SubStageVisit, (subStageVisit) => subStageVisit.factures, { nullable: true })
  @JoinColumn({ name: 'sub_stage_visit_id' })
  subStageVisit: SubStageVisit;

  @Column({ name: 'stageVisit_id', type: 'varchar', nullable: true })
  stageVisit_id: string;

  @ManyToOne(() => Stage)
  @JoinColumn({ name: 'stageVisit_id' })
  stageVisit: Stage;



    @Column({ name: 'decision_text', type: 'text', nullable: true })
  decision_text: string;

  @Column({ name: 'decision_date', type: 'date', nullable: true })
  decision_date: Date;

  @Column({ name: 'decision_outcome', length: 50, nullable: true })
  decision_outcome: string; // 'favorable', 'unfavorable', 'partial'

  @Column({ name: 'decision_notes', type: 'text', nullable: true })
  decision_notes: string;

  // Relation avec les documents de décision
  @ManyToMany(() => DocumentCustomer, (document) => document.decision_audiences, {
    cascade: true,
  })
  @JoinTable({
    name: 'audience_decision_documents',
    joinColumn: { name: 'audience_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'document_id', referencedColumnName: 'id' },
  })
  decision_documents: DocumentCustomer[];


  @ManyToOne(() => Stage)
  @JoinColumn({ name: 'stage_id' })
  stage: Stage;

  @ManyToOne(() => SubStage, (subStage) => subStage.audiences, { nullable: true })
  @JoinColumn({ name: 'sub_stage_id' })
  subStage: SubStage;

  // Garder aussi la liaison avec ProcedureInstance pour la vue globale
  @Column({ name: 'procedure_instance_id', type: 'varchar', nullable: true })
  procedure_instance_id: string;

  @ManyToOne(() => ProcedureInstance, { nullable: true })
  @JoinColumn({ name: 'procedure_instance_id' })
  procedureInstance: ProcedureInstance;

  // @OneToMany(() => DocumentCustomer, (document) => document.audience)
  // documents: DocumentCustomer[];

  // Getters
  get is_past(): boolean {
    const today = new Date();
    const audienceDateTime = new Date(`${this.audience_date}T${this.audience_time}`);
    return audienceDateTime < today;
  }

  get is_upcoming(): boolean {
    const today = new Date();
    const audienceDateTime = new Date(`${this.audience_date}T${this.audience_time}`);
    return audienceDateTime > today;
  }

  get is_today(): boolean {
    const today = new Date().toDateString();
    const audienceDate = new Date(this.audience_date).toDateString();
    return today === audienceDate;
  }

  get full_datetime(): Date {
    return new Date(`${this.audience_date}T${this.audience_time}`);
  }

  get needs_reminder(): boolean {
    if (this.reminder_sent || this.is_past) return false;
    
    const audienceDateTime = this.full_datetime;
    const now = new Date();
    const diffHours = (audienceDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);
    
    return diffHours <= 48; // Rappel 48h avant
  }

  // Méthodes
  postpone(new_date: Date, reason?: string): void {
    this.status = AudienceStatus.POSTPONED;
    this.postponed_to = new_date;
    if (reason) {
      this.notes = `${this.notes || ''}\nReporté: ${reason}`.trim();
    }
    this.reminder_sent = false; // Réinitialiser pour le nouveau date
  }

  mark_as_held(decision?: string, outcome?: string): void {
    this.status = AudienceStatus.HELD;
    if (decision) {
      this.decision = decision;
    }
    if (outcome) {
      this.outcome = outcome;
    }
  }

  cancel(reason?: string): void {
    this.status = AudienceStatus.CANCELLED;
    if (reason) {
      this.notes = `${this.notes || ''}\nAnnulé: ${reason}`.trim();
    }
  }
}