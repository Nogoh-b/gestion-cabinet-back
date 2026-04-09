// src/modules/diligences/entities/diligence.entity.ts
import { BaseEntity } from 'src/core/entities/baseEntity';
import { Dossier } from 'src/modules/dossiers/entities/dossier.entity';
import { DocumentCustomer } from 'src/modules/documents/document-customer/entities/document-customer.entity';
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, OneToMany, ManyToMany, JoinTable } from 'typeorm';
import { Finding, FindingSeverity, FindingStatus } from 'src/modules/finding/entities/finding.entity';
import { User } from 'src/modules/iam/user/entities/user.entity';
import { Step } from 'src/modules/dossiers/entities/step.entity';
import { ProcedureInstance } from 'src/modules/procedure/entities/procedure-instance.entity';
import { SubStage } from 'src/modules/procedure/entities/sub-stage.entity';
import { SubStageVisit } from 'src/modules/procedure/entities/sub-stage-visit.entity';
import { StageVisit } from 'src/modules/procedure/entities/stage-visit.entity';

export enum DiligenceType {
  ACQUISITION = 'acquisition',
  INVESTMENT = 'investment',
  IPO = 'ipo',
  COMPLIANCE = 'compliance',
  LITIGATION = 'litigation',
  CONTRACT = 'contract',
}

export enum DiligenceStatus {
  DRAFT = 'draft',
  IN_PROGRESS = 'in_progress',
  REVIEW = 'review',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export enum DiligencePriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

@Entity('diligences')
export class Diligence extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 255, nullable: false })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ 
    type: 'enum', 
    enum: DiligenceType, 
    default: DiligenceType.ACQUISITION 
  })
  type: DiligenceType;

  @Column({ 
    type: 'enum', 
    enum: DiligenceStatus, 
    default: DiligenceStatus.DRAFT 
  })
  status: DiligenceStatus;

  @Column({ 
    type: 'enum', 
    enum: DiligencePriority, 
    default: DiligencePriority.MEDIUM 
  })
  priority: DiligencePriority;

  @Column({ name: 'start_date', type: 'date', nullable: false })
  start_date: Date;

  @Column({ name: 'deadline', type: 'date', nullable: false })
  deadline: Date;

  @Column({ name: 'completion_date', type: 'date', nullable: true })
  completion_date: Date;

  @Column({ name: 'dossier_id', type: 'int', nullable: false })
  dossier_id: number;

  @Column({ name: 'assigned_lawyer_id', type: 'int', nullable: true })
  assigned_lawyer_id: number;

  @Column({ name: 'client_reference', length: 100, nullable: true })
  client_reference: string;

  @Column({ name: 'budget_hours', type: 'int', nullable: true })
  budget_hours: number;

  @Column({ name: 'actual_hours', type: 'int', nullable: true, default: 0 })
  actual_hours: number;

  @Column({ type: 'text', nullable: true })
  scope: string; // Périmètre de la diligence

  @Column({ name: 'findings_summary', type: 'text', nullable: true })
  findings_summary: string; // Résumé exécutif des findings

  @Column({ name: 'recommendations', type: 'text', nullable: true })
  recommendations: string; // Recommandations finales

  @Column({ name: 'report_generated', default: false })
  report_generated: boolean;

  @Column({ name: 'report_url', length: 500, nullable: true })
  report_url: string;

  @Column({ name: 'confidential', default: true })
  confidential: boolean;

  // Relations
  @ManyToOne(() => Dossier, (dossier) => dossier.diligences, { nullable: false })
  @JoinColumn({ name: 'dossier_id' })
  dossier: Dossier;

  @ManyToOne(() => User, (user) => user.assigned_diligences, { nullable: true })
  @JoinColumn({ name: 'assigned_lawyer_id' })
  assigned_lawyer: User;

  @OneToMany(() => Finding, (finding) => finding.diligence, {
    cascade: true,
    eager: false,
  })
  findings: Finding[];

  @ManyToMany(() => DocumentCustomer, (document) => document.diligences)
  @JoinTable({
    name: 'diligence_documents',
    joinColumn: { name: 'diligence_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'document_id', referencedColumnName: 'id' },
  })
  documents: DocumentCustomer[];


    @ManyToOne(() => Step, step => step.diligences, { nullable: true })
  @JoinColumn({ name: 'step_id' })
  step: Step;

  @Column({ name: 'step_id', type: 'int', nullable: true })
  step_id: number;

  @Column({ name: 'sub_stage_id', type: 'varchar', nullable: true })
  sub_stage_id: string;

  @ManyToOne(() => SubStage, (subStage) => subStage.factures, { nullable: true })
  @JoinColumn({ name: 'sub_stage_id' })
  subStage: SubStage;

  @Column({ name: 'sub_stage_visit_id', type: 'varchar', nullable: true })
  sub_stage_visit_id: string;

  @ManyToOne(() => SubStageVisit, (subStageVisit) => subStageVisit.factures, { nullable: true })
  @JoinColumn({ name: 'sub_stage_visit_id' })
  subStageVisit: SubStageVisit;

  // @Column({ name: 'stage_id', type: 'varchar', nullable: true })
  // stage_id: string;

  // @ManyToOne(() => Stage)
  // @JoinColumn({ name: 'stageVisit_id' })
  // stage: Stage;

  @Column({ name: 'stageVisit_id', type: 'varchar', nullable: true })
  stageVisit_id: string;

  @ManyToOne(() => StageVisit)
  @JoinColumn({ name: 'stageVisit_id' })
  stageVisit: StageVisit;

  // Garder aussi la liaison avec ProcedureInstance pour la vue globale
  @Column({ name: 'procedure_instance_id', type: 'varchar', nullable: true })
  procedure_instance_id: string;

  @ManyToOne(() => ProcedureInstance, { nullable: true })
  @JoinColumn({ name: 'procedure_instance_id' })
  procedureInstance: ProcedureInstance;


  // Getters
  get is_overdue(): boolean {
    if (this.status === DiligenceStatus.COMPLETED || this.status === DiligenceStatus.CANCELLED) {
      return false;
    }
    const today = new Date();
    return new Date(this.deadline) < today;
  }

  get days_remaining(): number | null {
    if (this.status === DiligenceStatus.COMPLETED || this.status === DiligenceStatus.CANCELLED) {
      return null;
    }
    const today = new Date();
    const deadline = new Date(this.deadline);
    const diffTime = deadline.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  get progress_percentage(): number {
    if (!this.findings || this.findings.length === 0) return 0;
    
    const totalFindings = this.findings.length;
    const completedFindings = this.findings.filter(
      f => 
        f.status === FindingStatus.RESOLVED ||
        f.status === FindingStatus.WAIVED
    ).length;  
        
    return Math.round((completedFindings / totalFindings) * 100);
  }

  get total_critical_findings(): number {
    return this.findings?.filter(f => f.severity === FindingSeverity.CRITICAL).length || 0;
  }

  get total_high_findings(): number {
    return this.findings?.filter(f => f.severity === FindingSeverity.HIGH).length || 0;
  }

  // Méthodes
  complete(recommendations?: string): void {
    this.status = DiligenceStatus.COMPLETED;
    this.completion_date = new Date();
    if (recommendations) {
      this.recommendations = recommendations;
    }
  }

  cancel(reason?: string): void {
    this.status = DiligenceStatus.CANCELLED;
    if (reason) {
      this.description = `${this.description || ''}\nAnnulé: ${reason}`.trim();
    }
  }

  addHours(hours: number): void {
    this.actual_hours = (this.actual_hours || 0) + hours;
  }
}