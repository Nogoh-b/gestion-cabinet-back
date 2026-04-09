// src/modules/findings/entities/finding.entity.ts
import { BaseEntity } from 'src/core/entities/baseEntity';
import { Diligence } from 'src/modules/diligence/entities/diligence.entity';
import { DocumentCustomer } from 'src/modules/documents/document-customer/entities/document-customer.entity';
import { User } from 'src/modules/iam/user/entities/user.entity';
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';

export enum FindingSeverity {
  CRITICAL = 'critical',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
  INFO = 'info',
}

export enum FindingStatus {
  IDENTIFIED = 'identified',
  IN_ANALYSIS = 'in_analysis',
  VALIDATED = 'validated',
  RESOLVED = 'resolved',
  WAIVED = 'waived', // Risque accepté par le client
}

export enum FindingCategory {
  CORPORATE = 'corporate', // Droit des sociétés
  CONTRACT = 'contract', // Contrats
  LABOR = 'labor', // Social
  TAX = 'tax', // Fiscal
  IP = 'ip', // Propriété intellectuelle
  LITIGATION = 'litigation', // Contentieux
  REAL_ESTATE = 'real_estate', // Immobilier
  REGULATORY = 'regulatory', // Réglementaire
  COMPLIANCE = 'compliance', // Conformité
  FINANCIAL = 'financial', // Financier
  OTHER = 'other',
}

@Entity('findings')
export class Finding extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 255, nullable: false })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ 
    type: 'enum', 
    enum: FindingSeverity, 
    default: FindingSeverity.MEDIUM 
  })
  severity: FindingSeverity;

  @Column({ 
    type: 'enum', 
    enum: FindingStatus, 
    default: FindingStatus.IDENTIFIED 
  })
  status: FindingStatus;

  @Column({ 
    type: 'enum', 
    enum: FindingCategory, 
    default: FindingCategory.OTHER 
  })
  category: FindingCategory;

  @Column({ name: 'diligence_id', type: 'int', nullable: false })
  diligence_id: number;

  @Column({ name: 'document_id', type: 'int', nullable: true })
  document_id: number;

  @Column({ name: 'created_by_id', type: 'int', nullable: true })
  created_by_id: number;

  @Column({ name: 'validated_by_id', type: 'int', nullable: true })
  validated_by_id: number;

  @Column({ name: 'validated_at', type: 'timestamp', nullable: true })
  validated_at: Date;

  @Column({ name: 'resolved_at', type: 'timestamp', nullable: true })
  resolved_at: Date;

  @Column({ type: 'text', nullable: true })
  impact: string; // Impact potentiel sur l'opération

  @Column({ type: 'text', nullable: true })
  recommendation: string; // Recommandation de l'avocat

  @Column({ name: 'client_comment', type: 'text', nullable: true })
  client_comment: string; // Commentaire du client

  @Column({ name: 'legal_basis', type: 'text', nullable: true })
  legal_basis: string; // Base légale / jurisprudence

  @Column({ name: 'estimated_risk_amount', type: 'decimal', precision: 15, scale: 2, nullable: true })
  estimated_risk_amount: number; // Montant estimé du risque (si applicable)

  @Column({ name: 'due_date', type: 'date', nullable: true })
  due_date: Date; // Date butoir pour la résolution

  @Column({ default: false })
  confidential: boolean;

  // Relations
  @ManyToOne(() => Diligence, (diligence) => diligence.findings, { nullable: false })
  @JoinColumn({ name: 'diligence_id' })
  diligence: Diligence;

  @ManyToOne(() => DocumentCustomer, (document) => document.findings, { nullable: true })
  @JoinColumn({ name: 'document_id' })
  document: DocumentCustomer;

  @ManyToOne(() => User, (user) => user.created_findings, { nullable: true })
  @JoinColumn({ name: 'created_by_id' })
  created_by: User;

  @ManyToOne(() => User, (user) => user.validated_findings, { nullable: true })
  @JoinColumn({ name: 'validated_by_id' })
  validated_by: User;

  // Getters
  get is_critical(): boolean {
    return this.severity === FindingSeverity.CRITICAL;
  }

  get days_to_resolve(): number | null {
    if (!this.due_date) return null;
    
    const today = new Date();
    const dueDate = new Date(this.due_date);
    const diffTime = dueDate.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  // Méthodes
  validate(userId: number): void {
    this.status = FindingStatus.VALIDATED;
    this.validated_by_id = userId;
    this.validated_at = new Date();
  }

  resolve(): void {
    this.status = FindingStatus.RESOLVED;
    this.resolved_at = new Date();
  }

  waive(comment?: string): void {
    this.status = FindingStatus.WAIVED;
    if (comment) {
      this.client_comment = comment;
    }
  }
}