// src/modules/diligences/entities/diligence.entity.ts
import { TenantEntity as BaseEntity } from 'src/core/entities/tenant.entity';
import { Dossier } from 'src/modules/dossiers/entities/dossier.entity';
import { DocumentCustomer } from 'src/modules/documents/document-customer/entities/document-customer.entity';
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, OneToMany, ManyToMany, JoinTable } from 'typeorm';
import { Finding, FindingSeverity, FindingStatus } from 'src/modules/finding/entities/finding.entity';
import { User } from 'src/modules/iam/user/entities/user.entity';
import { ProcedureInstance } from 'src/modules/procedure/entities/procedure-instance.entity';
import { SubStage } from 'src/modules/procedure/entities/sub-stage.entity';
import { SubStageVisit } from 'src/modules/procedure/entities/sub-stage-visit.entity';
import { StageVisit } from 'src/modules/procedure/entities/stage-visit.entity';
import { BusinessTable, BusinessColumn } from 'src/core/decorators/business-metadata.decorator';

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
@BusinessTable({
  label: 'Diligences',
  description: 'Gestion des investigations et actes réalisés dans le cadre des dossiers juridiques. Une diligence peut être de type acquisition, investissement, conformité, contentieux, contrat, etc.',
  icon: '🔍',
  category: 'investigation'
})
export class Diligence extends BaseEntity {
  @PrimaryGeneratedColumn()
  @BusinessColumn({
    label: 'Identifiant',
    description: 'Identifiant unique de la diligence',
    importance: 'low',
    group: 'technique',
    ignored: true
  })
  id: number;

  @Column({ length: 255, nullable: false })
  @BusinessColumn({
    label: 'Titre',
    description: 'Titre ou objet de la diligence',
    example: 'Due diligence fiscale - Acquisition société X',
    importance: 'critical',
    group: 'identification'
  })
  title: string;

  @Column({ type: 'text', nullable: true })
  @BusinessColumn({
    label: 'Description',
    description: 'Description détaillée de la diligence et de son périmètre',
    importance: 'high',
    group: 'contenu'
  })
  description: string;

  @Column({
    type: 'enum',
    enum: DiligenceType,
    default: DiligenceType.ACQUISITION
  })
  @BusinessColumn({
    label: "Type d'investigation",
    description: "BD: 'acquisition', 'investment', 'ipo', 'compliance', 'litigation', 'contract'.",
    example: 'compliance = Conformité réglementaire, litigation = Contentieux',
    importance: 'critical',
    group: 'classification'
  })
  type: DiligenceType;

  @Column({
    type: 'enum',
    enum: DiligenceStatus,
    default: DiligenceStatus.DRAFT
  })
  @BusinessColumn({
    label: 'Statut',
    description: "BD: 'draft'=Brouillon, 'in_progress'=En cours, 'review'=En relecture, 'completed'=Terminé, 'cancelled'=Annulé.",
    importance: 'critical',
    group: 'état'
  })
  status: DiligenceStatus;

  @Column({
    type: 'enum',
    enum: DiligencePriority,
    default: DiligencePriority.MEDIUM
  })
  @BusinessColumn({
    label: 'Priorité',
    description: "BD: 'low'=Faible, 'medium'=Moyenne, 'high'=Haute, 'critical'=Critique.",
    importance: 'high',
    group: 'priorité'
  })
  priority: DiligencePriority;

  @Column({ name: 'start_date', type: 'date', nullable: false })
  @BusinessColumn({
    label: 'Date de début',
    description: 'Date de commencement de la diligence',
    format: 'date',
    importance: 'high',
    group: 'dates'
  })
  start_date: Date;

  @Column({ name: 'deadline', type: 'date', nullable: false })
  @BusinessColumn({
    label: 'Date limite',
    description: 'Date butoir pour finaliser la diligence',
    format: 'date',
    importance: 'critical',
    group: 'dates'
  })
  deadline: Date;

  @Column({ name: 'completion_date', type: 'date', nullable: true })
  @BusinessColumn({
    label: 'Date de completion',
    description: 'Date de réalisation effective de la diligence',
    format: 'date',
    importance: 'medium',
    group: 'dates'
  })
  completion_date: Date;

  @Column({ name: 'dossier_id', type: 'int', nullable: false })
  dossier_id: number;

  @Column({ name: 'assigned_lawyer_id', type: 'int', nullable: true })
  assigned_lawyer_id: number;

  @Column({ name: 'client_reference', length: 100, nullable: true })
  @BusinessColumn({
    label: 'Référence client',
    description: 'Référence interne du client pour cette diligence',
    importance: 'medium',
    group: 'identification'
  })
  client_reference: string;

  @Column({ name: 'budget_hours', type: 'int', nullable: true })
  @BusinessColumn({
    label: 'Budget heures',
    description: "Nombre d'heures prévu pour réaliser la diligence",
    unit: 'heures',
    importance: 'high',
    group: 'financier'
  })
  budget_hours: number;

  @Column({ name: 'actual_hours', type: 'int', nullable: true, default: 0 })
  @BusinessColumn({
    label: 'Heures réelles',
    description: "Nombre d'heures réellement passées",
    unit: 'heures',
    importance: 'high',
    group: 'financier'
  })
  actual_hours: number;

  @Column({ type: 'text', nullable: true })
  @BusinessColumn({
    label: 'Périmètre',
    description: 'Description détaillée du périmètre de la diligence',
    importance: 'high',
    group: 'contenu'
  })
  scope: string;

  @Column({ name: 'findings_summary', type: 'text', nullable: true })
  @BusinessColumn({
    label: 'Résumé des constats',
    description: 'Synthèse des anomalies et constats identifiés',
    importance: 'high',
    group: 'résultats'
  })
  findings_summary: string;

  @Column({ name: 'recommendations', type: 'text', nullable: true })
  @BusinessColumn({
    label: 'Recommandations',
    description: 'Préconisations issues de la diligence',
    importance: 'high',
    group: 'résultats'
  })
  recommendations: string;

  @Column({ name: 'report_generated', default: false })
  report_generated: boolean;

  @Column({ name: 'report_url', length: 500, nullable: true })
  report_url: string;

  @Column({ name: 'confidential', default: true })
  @BusinessColumn({
    label: 'Confidentiel',
    description: 'True = document confidentiel (accès restreint)',
    importance: 'medium',
    group: 'sécurité'
  })
  confidential: boolean;

  // Relations
  @ManyToOne(() => Dossier, (dossier) => dossier.diligences, { nullable: false })
  @JoinColumn({ name: 'dossier_id' })
  @BusinessColumn({
    label: 'Dossier',
    description: 'Dossier juridique associé à la diligence',
    importance: 'critical',
    group: 'relation'
  })
  dossier: Dossier;

  @ManyToOne(() => User, (user) => user.assigned_diligences, { nullable: true })
  @JoinColumn({ name: 'assigned_lawyer_id' })
  @BusinessColumn({
    label: 'Avocat responsable',
    description: 'Avocat chargé de la diligence',
    importance: 'high',
    group: 'responsables'
  })
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
  @BusinessColumn({
    label: 'Documents',
    description: 'Documents associés à la diligence',
    importance: 'medium',
    group: 'documents'
  })
  documents: DocumentCustomer[];

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

  @Column({ name: 'stageVisit_id', type: 'varchar', nullable: true })
  stageVisit_id: string;

  @ManyToOne(() => StageVisit)
  @JoinColumn({ name: 'stageVisit_id' })
  stageVisit: StageVisit;

  @Column({ name: 'procedure_instance_id', type: 'varchar', nullable: true })
  procedure_instance_id: string;

  @ManyToOne(() => ProcedureInstance, { nullable: true })
  @JoinColumn({ name: 'procedure_instance_id' })
  procedureInstance: ProcedureInstance;

  // ==================== GETTERS MÉTIER ====================

  @BusinessColumn({
    label: 'Est en retard',
    description: 'True si la diligence dépasse sa date limite',
    importance: 'high',
    group: 'état'
  })
  get is_overdue(): boolean {
    if (this.status === DiligenceStatus.COMPLETED || this.status === DiligenceStatus.CANCELLED) {
      return false;
    }
    const today = new Date();
    return new Date(this.deadline) < today;
  }

  @BusinessColumn({
    label: 'Jours restants',
    description: "Nombre de jours avant la date limite (null si terminé)",
    unit: 'jours',
    importance: 'high',
    group: 'dates'
  })
  get days_remaining(): number | null {
    if (this.status === DiligenceStatus.COMPLETED || this.status === DiligenceStatus.CANCELLED) {
      return null;
    }
    const today = new Date();
    const deadline = new Date(this.deadline);
    const diffTime = deadline.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  @BusinessColumn({
    label: "Avancement",
    description: "Pourcentage d'avancement basé sur les constats résolus",
    unit: '%',
    format: 'percentage',
    importance: 'high',
    group: 'statistiques'
  })
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

  @BusinessColumn({
    label: "Constats critiques",
    description: "Nombre de constats de niveau critique",
    importance: 'high',
    group: 'statistiques'
  })
  get total_critical_findings(): number {
    return this.findings?.filter(f => f.severity === FindingSeverity.CRITICAL).length || 0;
  }

  @BusinessColumn({
    label: "Constats haute priorité",
    description: "Nombre de constats de priorité haute",
    importance: 'high',
    group: 'statistiques'
  })
  get total_high_findings(): number {
    return this.findings?.filter(f => f.severity === FindingSeverity.HIGH).length || 0;
  }

  @BusinessColumn({
    label: "Type libellé",
    description: "Libellé lisible du type d'investigation",
    importance: 'medium',
    group: 'classification'
  })
  get type_label(): string {
    const labels = {
      [DiligenceType.ACQUISITION]: 'Due diligence acquisition',
      [DiligenceType.INVESTMENT]: 'Due diligence investissement',
      [DiligenceType.IPO]: 'Due diligence introduction en bourse',
      [DiligenceType.COMPLIANCE]: 'Audit conformité',
      [DiligenceType.LITIGATION]: 'Investigation contentieuse',
      [DiligenceType.CONTRACT]: 'Audit contractuel'
    };
    return labels[this.type] || this.type;
  }

  @BusinessColumn({
    label: 'Statut libellé',
    description: 'Libellé lisible du statut',
    importance: 'medium',
    group: 'état'
  })
  get status_label(): string {
    const labels = {
      [DiligenceStatus.DRAFT]: 'Brouillon',
      [DiligenceStatus.IN_PROGRESS]: 'En cours',
      [DiligenceStatus.REVIEW]: 'En relecture',
      [DiligenceStatus.COMPLETED]: 'Terminé',
      [DiligenceStatus.CANCELLED]: 'Annulé'
    };
    return labels[this.status] || this.status;
  }

  @BusinessColumn({
    label: 'Priorité libellée',
    description: 'Libellé lisible de la priorité',
    importance: 'medium',
    group: 'priorité'
  })
  get priority_label(): string {
    const labels = {
      [DiligencePriority.LOW]: 'Basse',
      [DiligencePriority.MEDIUM]: 'Moyenne',
      [DiligencePriority.HIGH]: 'Haute',
      [DiligencePriority.CRITICAL]: 'Critique'
    };
    return labels[this.priority] || this.priority;
  }

  @BusinessColumn({
    label: 'Écart budget',
    description: "Différence entre heures réelles et budget (négatif = dépassement)",
    unit: 'heures',
    importance: 'medium',
    group: 'financier'
  })
  get budget_variance(): number {
    return (this.actual_hours || 0) - (this.budget_hours || 0);
  }

  // ==================== MÉTHODES MÉTIER ====================

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
