// src/modules/audiences/entities/audience.entity.ts
import { BaseEntity } from 'src/core/entities/baseEntity';
import { AudienceType } from 'src/modules/audience-type/entities/audience-type.entity';
import { DocumentCustomer } from 'src/modules/documents/document-customer/entities/document-customer.entity';
import { Dossier } from 'src/modules/dossiers/entities/dossier.entity';
import { Step } from 'src/modules/dossiers/entities/step.entity';
import { Jurisdiction } from 'src/modules/jurisdiction/entities/jurisdiction.entity';
import { ProcedureInstance } from 'src/modules/procedure/entities/procedure-instance.entity';
import { StageVisit } from 'src/modules/procedure/entities/stage-visit.entity';
import { Stage } from 'src/modules/procedure/entities/stage.entity';
import { SubStageVisit } from 'src/modules/procedure/entities/sub-stage-visit.entity';
import { SubStage } from 'src/modules/procedure/entities/sub-stage.entity';
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, ManyToMany, JoinTable } from 'typeorm';
import { BusinessTable, BusinessColumn } from 'src/core/decorators/business-metadata.decorator';

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
@BusinessTable({
  label: 'Audiences',
  description: 'Gestion des audiences programmées devant les tribunals. Une audience peut être de différents types (plaidoirie, délibération, jugement, conciliation) et peut être programmée, tenue, reportée ou annulée.',
  icon: '🏛️',
  category: 'procedure'
})
export class Audience extends BaseEntity {
  @PrimaryGeneratedColumn()
  @BusinessColumn({
    label: 'Identifiant',
    description: 'Identifiant unique de l\'audience',
    importance: 'low',
    group: 'technique',
    ignored: true
  })
  id: number;

  @Column({ name: 'audience_date', type: 'date', nullable: false })
  @BusinessColumn({
    label: 'Date de l\'audience',
    description: 'Date à laquelle l\'audience est programmée',
    format: 'date',
    importance: 'critical',
    group: 'dates'
  })
  audience_date: Date;

  @Column({ name: 'dossier_id', type: 'int', nullable: true })
  dossier_id: string;

  @Column({ name: 'audience_time', length: 10, nullable: false })
  @BusinessColumn({
    label: 'Heure de l\'audience',
    description: 'Horaire de début de l\'audience (format HH:MM)',
    example: '14:30',
    importance: 'critical',
    group: 'dates'
  })
  audience_time: string;

  @Column({ nullable: false, default: 1 })
  @BusinessColumn({
    label: 'Juridiction',
    description: 'Identifiant de la juridiction où se tient l\'audience',
    importance: 'high',
    group: 'localisation',
    ignored: true
  })
  jurisdiction_id: number;

  @Column({ name: 'room', length: 50, nullable: true })
  @BusinessColumn({
    label: 'Salle',
    description: 'Numéro ou nom de la salle d\'audience',
    example: 'Salle 14, Grande Chambre, Cabinet 3',
    importance: 'medium',
    group: 'localisation'
  })
  room: string;

  @Column({
    type: 'enum',
    enum: AudienceType1,
    default: AudienceType1.HEARING
  })
  @BusinessColumn({
    label: 'Type d\'audience',
    description: '0=Plaidoirie, 1=Délibération, 2=Jugement, 3=Conciliation',
    example: '0 = Audience de plaidoirie',
    importance: 'critical',
    group: 'classification'
  })
  type: AudienceType1;

  @Column({
    type: 'enum',
    enum: AudienceStatus,
    default: AudienceStatus.SCHEDULED
  })
  @BusinessColumn({
    label: 'Statut',
    description: '0=Programmée, 1=Tenue, 2=Reportée, 3=Annulée',
    importance: 'critical',
    group: 'état'
  })
  status: AudienceStatus;

  @Column({ type: 'text', nullable: true })
  @BusinessColumn({
    label: 'Notes',
    description: 'Observations et commentaires sur l\'audience',
    importance: 'medium',
    group: 'contenu'
  })
  notes: string;

  @ManyToOne(() => Step, step => step.audiences, { nullable: true })
  @JoinColumn({ name: 'step_id' })
  step: Step;

  @Column({ name: 'step_id', type: 'int', nullable: true })
  step_id: number;

  @Column({ name: 'decision', type: 'text', nullable: true })
  @BusinessColumn({
    label: 'Décision',
    description: 'Décision rendue lors de l\'audience',
    importance: 'high',
    group: 'résultat'
  })
  decision: string;

  @Column({ name: 'postponed_to', type: 'timestamp', nullable: true })
  @BusinessColumn({
    label: 'Reportée à',
    description: 'Nouvelle date et heure si l\'audience a été reportée',
    format: 'date',
    importance: 'high',
    group: 'dates'
  })
  postponed_to: Date;

  @Column({ name: 'reminder_sent', default: false })
  reminder_sent: boolean;

  @Column({ name: 'reminder_sent_at', type: 'timestamp', nullable: true })
  reminder_sent_at: Date;

  @Column({ name: 'duration_minutes', type: 'int', nullable: true })
  @BusinessColumn({
    label: 'Durée',
    description: 'Durée prévue ou réelle de l\'audience en minutes',
    unit: 'minutes',
    importance: 'medium',
    group: 'planification'
  })
  duration_minutes: number;

  @Column({ name: 'judge_name', length: 255, nullable: true })
  @BusinessColumn({
    label: 'Juge',
    description: 'Nom du juge ou magistrat présidant l\'audience',
    example: 'Madame la Présidente Dupont, Monsieur le Juge Martin',
    importance: 'high',
    group: 'personnes'
  })
  judge_name: string;

  @Column({ nullable: true, default: 1 })
  audience_type_id: number;

  @Column({ name: 'outcome', length: 100, nullable: true })
  @BusinessColumn({
    label: 'Issue',
    description: 'Résultat de l\'audience: favorable, défavorable, partiel, reporté',
    example: 'favorable, unfavorable, partial, postponed',
    importance: 'high',
    group: 'résultat'
  })
  outcome: string;

  // Relations
  @ManyToOne(() => Dossier, (dossier) => dossier.audiences, { nullable: false })
  @JoinColumn({ name: 'dossier_id' })
  @BusinessColumn({
    label: 'Dossier',
    description: 'Dossier juridique concerné par l\'audience',
    importance: 'critical',
    group: 'relation'
  })
  dossier: Dossier;

  @ManyToOne(() => Jurisdiction, (jurisdiction) => jurisdiction.audiences, { nullable: false })
  @JoinColumn({ name: 'jurisdiction_id' })
  @BusinessColumn({
    label: 'Tribunal',
    description: 'Juridiction où se tient l\'audience',
    importance: 'high',
    group: 'localisation'
  })
  jurisdiction: Jurisdiction;

  @ManyToOne(() => AudienceType, (audienceType) => audienceType.audiences, { nullable: true })
  @JoinColumn({ name: 'audience_type_id' })
  audience_type: AudienceType;

  @ManyToMany(() => DocumentCustomer, (document) => document.audiences, {
    cascade: true,
  })
  @JoinTable({
    name: 'audience_documents',
    joinColumn: { name: 'audience_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'document_id', referencedColumnName: 'id' },
  })
  documents: DocumentCustomer[];

  @Column({ name: 'sub_stage_id', type: 'varchar', nullable: true })
  sub_stage_id: string;

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

  @Column({ name: 'decision_text', type: 'text', nullable: true })
  @BusinessColumn({
    label: 'Texte de la décision',
    description: 'Texte complet de la décision rendue',
    importance: 'high',
    group: 'résultat'
  })
  decision_text: string;

  @Column({ name: 'decision_date', type: 'date', nullable: true })
  @BusinessColumn({
    label: 'Date de la décision',
    description: 'Date à laquelle la décision a été rendue',
    format: 'date',
    importance: 'high',
    group: 'dates'
  })
  decision_date: Date;

  @Column({ name: 'decision_outcome', length: 50, nullable: true })
  @BusinessColumn({
    label: 'Issue de la décision',
    description: 'favorable, défavorable, partiel',
    importance: 'high',
    group: 'résultat'
  })
  decision_outcome: string;

  @Column({ name: 'decision_notes', type: 'text', nullable: true })
  @BusinessColumn({
    label: 'Notes décision',
    description: 'Commentaires supplémentaires sur la décision',
    importance: 'medium',
    group: 'résultat'
  })
  decision_notes: string;

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

  @Column({ name: 'procedure_instance_id', type: 'varchar', nullable: true })
  procedure_instance_id: string;

  @ManyToOne(() => ProcedureInstance, { nullable: true })
  @JoinColumn({ name: 'procedure_instance_id' })
  procedureInstance: ProcedureInstance;

  // ==================== GETTERS MÉTIER ====================

  @BusinessColumn({
    label: 'Est passée',
    description: 'True si l\'audience a déjà eu lieu',
    importance: 'medium',
    group: 'état'
  })
  get is_past(): boolean {
    const today = new Date();
    const audienceDateTime = new Date(`${this.audience_date}T${this.audience_time}`);
    return audienceDateTime < today;
  }

  @BusinessColumn({
    label: 'Est à venir',
    description: 'True si l\'audience est programmée dans le futur',
    importance: 'medium',
    group: 'état'
  })
  get is_upcoming(): boolean {
    const today = new Date();
    const audienceDateTime = new Date(`${this.audience_date}T${this.audience_time}`);
    return audienceDateTime > today;
  }

  @BusinessColumn({
    label: 'Est aujourd\'hui',
    description: 'True si l\'audience est prévue pour aujourd\'hui',
    importance: 'high',
    group: 'état'
  })
  get is_today(): boolean {
    const today = new Date().toDateString();
    const audienceDate = new Date(this.audience_date).toDateString();
    return today === audienceDate;
  }

  get full_datetime(): Date {
    return new Date(`${this.audience_date}T${this.audience_time}`);
  }

  @BusinessColumn({
    label: 'Date complète',
    description: 'Date et heure formatées pour affichage',
    importance: 'high',
    group: 'dates'
  })
  get display_datetime_formatted(): string {
    const date = this.display_datetime;
    return date.toLocaleString('fr-FR', {
      dateStyle: 'full',
      timeStyle: 'short'
    });
  }

  get needs_reminder(): boolean {
    if (this.reminder_sent || this.is_past) return false;
    const audienceDateTime = this.full_datetime;
    const now = new Date();
    const diffHours = (audienceDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);
    return diffHours <= 48;
  }

  get display_date(): Date {
    if (this.status === AudienceStatus.POSTPONED && this.postponed_to) {
      return this.postponed_to;
    }
    return this.audience_date;
  }

  get display_time(): string {
    if (this.status === AudienceStatus.POSTPONED && this.postponed_to) {
      const hours = this.postponed_to.getHours().toString().padStart(2, '0');
      const minutes = this.postponed_to.getMinutes().toString().padStart(2, '0');
      return `${hours}:${minutes}`;
    }
    return this.audience_time;
  }

  get display_datetime(): Date {
    if (this.status === AudienceStatus.POSTPONED && this.postponed_to) {
      return this.postponed_to;
    }
    return new Date(`${this.audience_date}T${this.audience_time}`);
  }

  @BusinessColumn({
    label: 'Est reportée',
    description: 'True si l\'audience a été reportée',
    importance: 'high',
    group: 'état'
  })
  get is_postponed(): boolean {
    return this.status === AudienceStatus.POSTPONED && !!this.postponed_to;
  }

  @BusinessColumn({
    label: 'Statut libellé',
    description: 'Libellé lisible du statut',
    importance: 'high',
    group: 'état'
  })
  get status_label(): string {
    const labels = {
      [AudienceStatus.SCHEDULED]: 'Programmée',
      [AudienceStatus.HELD]: 'Tenue',
      [AudienceStatus.POSTPONED]: 'Reportée',
      [AudienceStatus.CANCELLED]: 'Annulée'
    };
    return labels[this.status] || 'Inconnu';
  }

  @BusinessColumn({
    label: 'Type libellé',
    description: 'Libellé lisible du type d\'audience',
    importance: 'high',
    group: 'classification'
  })
  get type_label(): string {
    const labels = {
      [AudienceType1.HEARING]: 'Plaidoirie',
      [AudienceType1.DELIBERATION]: 'Délibération',
      [AudienceType1.JUDGMENT]: 'Jugement',
      [AudienceType1.CONCILIATION]: 'Conciliation'
    };
    return labels[this.type] || 'Inconnu';
  }

  // ==================== MÉTHODES MÉTIER ====================

  postpone(new_date: Date, new_hour: string, reason?: string): void {
    this.status = AudienceStatus.POSTPONED;
    const [hours, minutes] = new_hour.split(':');
    const newDateTime = new Date(new_date);
    newDateTime.setHours(parseInt(hours), parseInt(minutes), 0);
    this.postponed_to = newDateTime;
    if (reason) {
      this.notes = `${this.notes || ''}\nReporté: ${reason}`.trim();
    }
    this.reminder_sent = false;
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