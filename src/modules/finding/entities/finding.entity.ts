// src/modules/findings/entities/finding.entity.ts
import { BaseEntity } from 'src/core/entities/baseEntity';
import { Diligence } from 'src/modules/diligence/entities/diligence.entity';
import { DocumentCustomer } from 'src/modules/documents/document-customer/entities/document-customer.entity';
import { User } from 'src/modules/iam/user/entities/user.entity';
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BusinessTable, BusinessColumn } from 'src/core/decorators/business-metadata.decorator';

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
@BusinessTable({
  label: 'Constats / Anomalies',
  description: 'Gestion des constats, anomalies et risques identifiés lors des diligences légales (due diligence). Chaque constat a une sévérité (critique, élevé, moyen, faible, info) et un statut (identifié, en analyse, validé, résolu, accepté).',
  icon: '⚠️',
  category: 'investigation'
})
export class Finding extends BaseEntity {
  @PrimaryGeneratedColumn()
  @BusinessColumn({
    label: 'Identifiant',
    description: 'Identifiant unique du constat',
    importance: 'low',
    group: 'technique',
    ignored: true
  })
  id: number;

  @Column({ length: 255, nullable: false })
  @BusinessColumn({
    label: 'Titre',
    description: 'Titre ou objet du constat',
    example: 'Non-conformité fiscale, Clause contractuelle déséquilibrée, Défaut de gouvernance',
    importance: 'critical',
    group: 'identification'
  })
  title: string;

  @Column({ type: 'text', nullable: true })
  @BusinessColumn({
    label: 'Description',
    description: 'Description détaillée du constat et de son contexte',
    importance: 'high',
    group: 'contenu'
  })
  description: string;

  @Column({
    type: 'enum',
    enum: FindingSeverity,
    default: FindingSeverity.MEDIUM
  })
  @BusinessColumn({
    label: 'Sévérité',
    description: 'critical = Critique (bloquant), high = Élevé, medium = Moyen, low = Faible, info = Information',
    example: 'critical, high, medium, low, info',
    importance: 'critical',
    group: 'priorité'
  })
  severity: FindingSeverity;

  @Column({
    type: 'enum',
    enum: FindingStatus,
    default: FindingStatus.IDENTIFIED
  })
  @BusinessColumn({
    label: 'Statut',
    description: 'identified = Identifié, in_analysis = En analyse, validated = Validé, resolved = Résolu, waived = Accepté par le client',
    importance: 'critical',
    group: 'état'
  })
  status: FindingStatus;

  @Column({
    type: 'enum',
    enum: FindingCategory,
    default: FindingCategory.OTHER
  })
  @BusinessColumn({
    label: 'Catégorie',
    description: 'corporate (Sociétés), contract (Contrats), labor (Social), tax (Fiscal), ip (PI), litigation (Contentieux), real_estate (Immobilier), regulatory (Réglementaire), compliance (Conformité), financial (Financier)',
    importance: 'high',
    group: 'classification'
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
  @BusinessColumn({
    label: 'Date de validation',
    description: 'Date à laquelle le constat a été validé',
    format: 'date',
    importance: 'medium',
    group: 'dates'
  })
  validated_at: Date;

  @Column({ name: 'resolved_at', type: 'timestamp', nullable: true })
  @BusinessColumn({
    label: 'Date de résolution',
    description: 'Date à laquelle le constat a été résolu',
    format: 'date',
    importance: 'medium',
    group: 'dates'
  })
  resolved_at: Date;

  @Column({ type: 'text', nullable: true })
  @BusinessColumn({
    label: 'Impact',
    description: 'Impact potentiel sur l’opération ou le dossier',
    example: 'Risque de nullité du contrat, Pénalités fiscales estimées à X€',
    importance: 'high',
    group: 'analyse'
  })
  impact: string;

  @Column({ type: 'text', nullable: true })
  @BusinessColumn({
    label: 'Recommandation',
    description: 'Recommandation de l’avocat pour traiter le constat',
    example: 'Renégocier la clause, Obtenir une régularisation fiscale',
    importance: 'high',
    group: 'analyse'
  })
  recommendation: string;

  @Column({ name: 'client_comment', type: 'text', nullable: true })
  @BusinessColumn({
    label: 'Commentaire client',
    description: 'Commentaire ou décision du client sur le constat (ex: acceptation du risque)',
    importance: 'medium',
    group: 'communication'
  })
  client_comment: string;

  @Column({ name: 'legal_basis', type: 'text', nullable: true })
  @BusinessColumn({
    label: 'Base légale',
    description: 'Références juridiques justifiant le constat (articles de loi, jurisprudence)',
    example: 'Article L. 123-1 Code de commerce, Cass. civ. 3e, 12 janv. 2023',
    importance: 'high',
    group: 'juridique'
  })
  legal_basis: string;

  @Column({ name: 'estimated_risk_amount', type: 'decimal', precision: 15, scale: 2, nullable: true })
  @BusinessColumn({
    label: 'Montant estimé du risque',
    description: 'Évaluation financière du risque potentiel',
    unit: '€',
    format: 'currency',
    importance: 'high',
    group: 'financier'
  })
  estimated_risk_amount: number;

  @Column({ name: 'due_date', type: 'date', nullable: true })
  @BusinessColumn({
    label: 'Date butoir',
    description: 'Date limite pour la résolution du constat',
    format: 'date',
    importance: 'high',
    group: 'dates'
  })
  due_date: Date;

  @Column({ default: false })
  @BusinessColumn({
    label: 'Confidentiel',
    description: 'True = constat confidentiel (accès restreint)',
    importance: 'medium',
    group: 'sécurité'
  })
  confidential: boolean;

  // Relations
  @ManyToOne(() => Diligence, (diligence) => diligence.findings, { nullable: false })
  @JoinColumn({ name: 'diligence_id' })
  @BusinessColumn({
    label: 'Diligence',
    description: 'Diligence légale à laquelle ce constat est rattaché',
    importance: 'critical',
    group: 'relation'
  })
  diligence: Diligence;

  @ManyToOne(() => DocumentCustomer, (document) => document.findings, { nullable: true })
  @JoinColumn({ name: 'document_id' })
  @BusinessColumn({
    label: 'Document source',
    description: 'Document à l’origine du constat',
    importance: 'medium',
    group: 'relation'
  })
  document: DocumentCustomer;

  @ManyToOne(() => User, (user) => user.created_findings, { nullable: true })
  @JoinColumn({ name: 'created_by_id' })
  created_by: User;

  @ManyToOne(() => User, (user) => user.validated_findings, { nullable: true })
  @JoinColumn({ name: 'validated_by_id' })
  validated_by: User;

  // ==================== GETTERS MÉTIER ====================

  @BusinessColumn({
    label: 'Est critique',
    description: 'True si le constat est de sévérité critique (bloquant pour l’opération)',
    importance: 'high',
    group: 'priorité'
  })
  get is_critical(): boolean {
    return this.severity === FindingSeverity.CRITICAL;
  }

  @BusinessColumn({
    label: 'Jours restants',
    description: "Nombre de jours avant la date butoir (null si non défini)",
    unit: 'jours',
    importance: 'medium',
    group: 'dates'
  })
  get days_to_resolve(): number | null {
    if (!this.due_date) return null;
    const today = new Date();
    const dueDate = new Date(this.due_date);
    const diffTime = dueDate.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  @BusinessColumn({
    label: 'Est en retard',
    description: 'True si la date butoir est dépassée et le constat non résolu',
    importance: 'high',
    group: 'dates'
  })
  get is_overdue(): boolean {
    if (!this.due_date) return false;
    if (this.status === FindingStatus.RESOLVED || this.status === FindingStatus.WAIVED) {
      return false;
    }
    const today = new Date();
    const dueDate = new Date(this.due_date);
    return today > dueDate;
  }

  @BusinessColumn({
    label: 'Sévérité libellée',
    description: 'Libellé lisible de la sévérité',
    importance: 'medium',
    group: 'priorité'
  })
  get severity_label(): string {
    const labels = {
      [FindingSeverity.CRITICAL]: 'Critique',
      [FindingSeverity.HIGH]: 'Élevée',
      [FindingSeverity.MEDIUM]: 'Moyenne',
      [FindingSeverity.LOW]: 'Faible',
      [FindingSeverity.INFO]: 'Information'
    };
    return labels[this.severity] || this.severity;
  }

  @BusinessColumn({
    label: 'Statut libellé',
    description: 'Libellé lisible du statut',
    importance: 'medium',
    group: 'état'
  })
  get status_label(): string {
    const labels = {
      [FindingStatus.IDENTIFIED]: 'Identifié',
      [FindingStatus.IN_ANALYSIS]: 'En analyse',
      [FindingStatus.VALIDATED]: 'Validé',
      [FindingStatus.RESOLVED]: 'Résolu',
      [FindingStatus.WAIVED]: 'Accepté par le client'
    };
    return labels[this.status] || this.status;
  }

  @BusinessColumn({
    label: 'Catégorie libellée',
    description: 'Libellé lisible de la catégorie',
    importance: 'medium',
    group: 'classification'
  })
  get category_label(): string {
    const labels = {
      [FindingCategory.CORPORATE]: 'Droit des sociétés',
      [FindingCategory.CONTRACT]: 'Contrats',
      [FindingCategory.LABOR]: 'Social',
      [FindingCategory.TAX]: 'Fiscal',
      [FindingCategory.IP]: 'Propriété intellectuelle',
      [FindingCategory.LITIGATION]: 'Contentieux',
      [FindingCategory.REAL_ESTATE]: 'Immobilier',
      [FindingCategory.REGULATORY]: 'Réglementaire',
      [FindingCategory.COMPLIANCE]: 'Conformité',
      [FindingCategory.FINANCIAL]: 'Financier',
      [FindingCategory.OTHER]: 'Autre'
    };
    return labels[this.category] || this.category;
  }

  // ==================== MÉTHODES MÉTIER ====================

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