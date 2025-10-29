// src/modules/audiences/entities/audience.entity.ts
import { BaseEntity } from 'src/core/entities/baseEntity';
import { DocumentCustomer } from 'src/modules/documents/document-customer/entities/document-customer.entity';
import { Dossier } from 'src/modules/dossiers/entities/dossier.entity';
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, ManyToMany, JoinTable } from 'typeorm';



export enum AudienceStatus {
  SCHEDULED = 0,
  HELD = 1,
  POSTPONED = 2,
  CANCELLED = 3,
}

export enum AudienceType {
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
  dossier_id: Date;

  @Column({ name: 'audience_time', length: 10, nullable: false })
  audience_time: string;

  @Column({ name: 'jurisdiction', length: 255, nullable: false })
  jurisdiction: string;

  @Column({ name: 'room', length: 50, nullable: true })
  room: string;

  @Column({ 
    type: 'enum', 
    enum: AudienceType, 
    default: AudienceType.HEARING 
  })
  type: AudienceType;

  @Column({ 
    type: 'enum', 
    enum: AudienceStatus, 
    default: AudienceStatus.SCHEDULED 
  })
  status: AudienceStatus;

  @Column({ type: 'text', nullable: true })
  notes: string;

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

  @Column({ name: 'outcome', length: 100, nullable: true })
  outcome: string; // 'favorable', 'unfavorable', 'partial', 'postponed'

  // Relations
  @ManyToOne(() => Dossier, (dossier) => dossier.audiences, { nullable: false })
  @JoinColumn({ name: 'dossier_id' })
  dossier: Dossier;

  @ManyToMany(() => DocumentCustomer, (document) => document.audiences, {
    cascade: true, // facultatif, selon si tu veux créer les documents via audience
  })
  @JoinTable({
    name: 'audience_documents', // nom de la table pivot
    joinColumn: { name: 'audience_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'document_id', referencedColumnName: 'id' },
  })
  documents: DocumentCustomer[];

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