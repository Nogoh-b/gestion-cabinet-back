import { BusinessTable, BusinessColumn } from 'src/core/decorators/business-metadata.decorator';
import { TenantEntity as BaseEntity } from 'src/core/entities/tenant.entity';
import { DossierStatus } from 'src/core/enums/dossier-status.enum';
import { Audience } from 'src/modules/audiences/entities/audience.entity';
import { Customer } from 'src/modules/customer/customer/entities/customer.entity';
import { Diligence } from 'src/modules/diligence/entities/diligence.entity';
import { DocumentCategory } from 'src/modules/document-category/entities/document-category.entity';
import { Dossier } from 'src/modules/dossiers/entities/dossier.entity';
import { Step } from 'src/modules/dossiers/entities/step.entity';
import { Finding } from 'src/modules/finding/entities/finding.entity';
import { User } from 'src/modules/iam/user/entities/user.entity';
import { ProcedureInstance } from 'src/modules/procedure/entities/procedure-instance.entity';
import { StageVisit } from 'src/modules/procedure/entities/stage-visit.entity';
import { Stage } from 'src/modules/procedure/entities/stage.entity';
import { SubStageVisit } from 'src/modules/procedure/entities/sub-stage-visit.entity';
import { SubStage } from 'src/modules/procedure/entities/sub-stage.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToMany,
  OneToMany,
  JoinTable,
  BeforeInsert,
} from 'typeorm';

import { DocumentType } from '../../document-type/entities/document-type.entity';


export enum DocumentCustomerStatus {
  PENDING = 0,
  ACCEPTED = 1,
  REFUSED = 2,
  EXPIRED = 3,
  ARCHIVED = 4,
}

@Entity('document_customer')
@BusinessTable({
  label: 'Documents clients',
  description: 'Gestion des documents uploadés par les clients ou par le cabinet. Un document peut être une pièce d\'identité, un contrat, une conclusion, un jugement, ou toute autre pièce jointe liée à un dossier ou à un client.',
  icon: '📄',
  category: 'document'
})
export class DocumentCustomer extends BaseEntity {
  @PrimaryGeneratedColumn()
  @BusinessColumn({
    label: 'Identifiant technique',
    description: 'Numéro unique généré automatiquement',
    importance: 'low',
    group: 'technique',
    ignored: true  // ✅ Ignoré car non utile pour l'IA
  })
  id: number;

  @Column()
  @BusinessColumn({
    label: 'Nom du document',
    description: 'Nom original du fichier uploadé. Utitalisé pour rechercher un document par son nom.',
    example: 'Contrat_MeDupont_2025.pdf',
    importance: 'critical',
    group: 'identification'
  })
  name: string;

  @Column({ type: 'int', nullable: true })
  @BusinessColumn({
    label: 'Type de document',
    description: 'Identifiant du type de document (PIÈCE_IDENTITÉ, CONTRAT, CONCLUSION, JUGEMENT, etc.)',
    importance: 'high',
    group: 'classification',
    ignored: true  // Relation gérée par document_type
  })
  document_type_id?: number;

  @Column({ type: 'int', nullable: true })
  @BusinessColumn({
    label: 'Client',
    description: 'Identifiant du client propriétaire du document',
    importance: 'critical',
    group: 'relation'
  })
  customer_id?: number;

  @Column({ type: 'int', nullable: true })
  @BusinessColumn({
    label: 'Dossier',
    description: 'Identifiant du dossier associé au document',
    importance: 'critical',
    group: 'relation'
  })
  dossier_id?: number;

  @Column({ type: 'int', nullable: true })
  @BusinessColumn({
    label: 'Uploadé par',
    description: 'Identifiant de l\'utilisateur qui a uploadé le document',
    importance: 'low',
    group: 'audit',
    ignored: true
  })
  uploaded_by_id?: number;

  @Column({ type: 'text', nullable: true })
  @BusinessColumn({
    label: 'Description',
    description: 'Description textuelle du contenu ou de l\'objet du document',
    example: 'Contrat de prestation signé le 15/03/2025',
    importance: 'high',
    group: 'contenu'
  })
  description: string;

  // Relations
  @ManyToOne(() => DocumentType, { eager: false })
  @JoinColumn({ name: 'document_type_id' })
  document_type: DocumentType;

  @ManyToOne(() => Customer)
  @JoinColumn({ name: 'customer_id' })
  @BusinessColumn({
    label: 'Client',
    description: 'Client auquel appartient le document',
    importance: 'critical',
    group: 'relation'
  })
  customer: Customer;

  @Column({ type: 'int', nullable: true })
  @BusinessColumn({
    label: 'Catégorie',
    description: 'Catégorie du document (procedural, client, internal, financial, decision)',
    importance: 'high',
    group: 'classification'
  })
  category_id?: number;

  @ManyToMany(() => Audience, (audience) => audience.decision_documents)
  decision_audiences: Audience[];

  @ManyToOne(() => DocumentCategory, { eager: false })
  @JoinColumn({ name: 'category_id' })
  category: DocumentCategory;

  @Column({
    type: 'enum',
    enum: DocumentCustomerStatus,
    default: DocumentCustomerStatus.ACCEPTED
  })
  @BusinessColumn({
    label: 'Statut',
    description: '0=En attente, 1=Validé, 2=Refusé, 3=Expiré, 4=Archivé',
    example: '1 = Validé',
    importance: 'high',
    group: 'validation'
  })
  status: DocumentCustomerStatus;

  @Column({ name: 'file_path', nullable: true })
  @BusinessColumn({
    label: 'Chemin du fichier',
    description: 'Emplacement physique du fichier sur le serveur',
    importance: 'low',
    group: 'stockage',
    ignored: true  // Technique, pas utile pour l'IA
  })
  file_path: string;

  @Column({ name: 'file_url', nullable: true })
  @BusinessColumn({
    label: 'URL du fichier',
    description: 'Lien de téléchargement du document',
    importance: 'medium',
    group: 'stockage'
  })
  file_url: string;

  @Column({ name: 'file_size', nullable: true })
  @BusinessColumn({
    label: 'Taille',
    description: 'Taille du fichier en octets',
    unit: 'bytes',
    importance: 'low',
    group: 'stockage'
  })
  file_size: number;

  @Column({ name: 'file_mimetype', nullable: true })
  @BusinessColumn({
    label: 'Type MIME',
    description: 'Type de fichier (application/pdf, image/jpeg, etc.)',
    importance: 'low',
    group: 'stockage',
    ignored: true
  })
  file_mimetype: string;

  @Column({ name: 'version', default: 1 })
  @BusinessColumn({
    label: 'Version',
    description: 'Numéro de version du document (incrémenté à chaque modification)',
    importance: 'low',
    group: 'versioning'
  })
  version: number;

  @Column({ name: 'is_current_version', default: true })
  @BusinessColumn({
    label: 'Version courante',
    description: 'True = version actuelle, False = version archivée',
    importance: 'medium',
    group: 'versioning'
  })
  is_current_version: boolean;

  @ManyToOne(() => DocumentCustomer, { nullable: true })
  @JoinColumn({ name: 'previous_version_id' })
  previous_version: DocumentCustomer;

  @ManyToOne(() => Dossier, { nullable: false })
  @JoinColumn({ name: 'dossier_id' })
  @BusinessColumn({
    label: 'Dossier associé',
    description: 'Dossier juridique auquel le document est rattaché',
    importance: 'critical',
    group: 'relation'
  })
  dossier: Dossier;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'uploaded_by_id' })
  uploaded_by: User;

  @ManyToMany(() => Step, step => step.documents)
  @JoinTable({
    name: 'step_documents',
    joinColumn: { name: 'document_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'step_id', referencedColumnName: 'id' }
  })
  steps: Step[];

  @Column({ name: 'uploaded_at', type: 'timestamp' })
  @CreateDateColumn()
  @BusinessColumn({
    label: "Date d'upload",
    description: 'Date et heure de téléchargement du document',
    format: 'date',
    importance: 'high',
    group: 'dates'
  })
  uploaded_at: Date;

  @Column({ name: 'last_modified', type: 'timestamp' })
  @UpdateDateColumn()
  @BusinessColumn({
    label: 'Dernière modification',
    description: 'Date et heure de la dernière modification',
    format: 'date',
    importance: 'medium',
    group: 'dates'
  })
  last_modified: Date;

  @Column({ name: 'date_validation', nullable: true })
  @BusinessColumn({
    label: 'Date de validation',
    description: 'Date de validation officielle du document',
    format: 'date',
    importance: 'high',
    group: 'validation'
  })
  date_validation: Date;

  @Column({ name: 'date_ejected', nullable: true })
  @BusinessColumn({
    label: "Date de rejet",
    description: 'Date de rejet si le document a été refusé',
    format: 'date',
    importance: 'medium',
    group: 'validation'
  })
  date_ejected: Date;

  @Column({ name: 'date_expired', nullable: true })
  @BusinessColumn({
    label: "Date d'expiration",
    description: 'Date à laquelle le document expire (ex: pièce d\'identité)',
    format: 'date',
    importance: 'high',
    group: 'validation'
  })
  date_expired: Date;

  @Column({ name: 'required_for_hearing', default: false })
  @BusinessColumn({
    label: 'Requis pour audience',
    description: 'True = document obligatoire pour une audience',
    importance: 'high',
    group: 'audience'
  })
  required_for_hearing: boolean;

  @Column({ name: 'is_confidential', default: false })
  @BusinessColumn({
    label: 'Confidentiel',
    description: 'True = document confidentiel (accès restreint)',
    importance: 'high',
    group: 'sécurité'
  })
  is_confidential: boolean;

  @Column({ name: 'metadata', type: 'json', nullable: true })
  @BusinessColumn({
    label: 'Métadonnées',
    description: 'Informations supplémentaires (mots-clés, nombre de pages, langue, etc.)',
    importance: 'low',
    group: 'technique',
    ignored: true
  })
  metadata: {
    keywords?: string[];
    page_count?: number;
    language?: string;
    original_filename?: string;
    audit_trail?: Array<{
      action: string;
      user_id: number;
      timestamp: Date;
      details?: string;
    }>;
  };

  @ManyToMany(() => Audience, (audience) => audience.documents)
  audiences: Audience[];

  @ManyToMany(() => Diligence, (diligence) => diligence.documents)
  diligences: Diligence[];

  @ManyToMany(() => ProcedureInstance, (instance) => instance.documents)
  procedureInstances: ProcedureInstance[];

  @ManyToMany(() => Stage, (stage) => stage.documents)
  @JoinTable({
    name: 'stage_documents',
    joinColumn: { name: 'document_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'stage_id', referencedColumnName: 'id' },
  })
  stages: Stage[];

  @ManyToMany(() => StageVisit, (stage) => stage.documents)
  @JoinTable({
    name: 'stage_visit_documents',
    joinColumn: { name: 'document_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'stageVisit_id', referencedColumnName: 'id' },
  })
  stageVisits: StageVisit[];

  @ManyToMany(() => SubStageVisit, (subVisit) => subVisit.documents)
  @JoinTable({
    name: 'sub_stage_visit_documents',
    joinColumn: { name: 'document_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'sub_stage_visit_id', referencedColumnName: 'id' },
  })
  sub_stage_visits: SubStageVisit[];

  @ManyToMany(() => SubStage, (subStage) => subStage.documents)
  subStages: SubStage[];

  @OneToMany(() => Finding, (finding) => finding.document)
  findings: Finding[];

  // ==================== GETTERS MÉTIER ====================

  get status_label(): string {
    const statusLabels = {
      [DocumentCustomerStatus.PENDING]: 'En attente',
      [DocumentCustomerStatus.ACCEPTED]: 'Validé',
      [DocumentCustomerStatus.REFUSED]: 'Refusé',
      [DocumentCustomerStatus.EXPIRED]: 'Expiré',
      [DocumentCustomerStatus.ARCHIVED]: 'Archivé',
    };
    return statusLabels[this.status] || 'Inconnu';
  }

  get file_size_formatted(): string {
    if (!this.file_size) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(this.file_size) / Math.log(1024));
    return Math.round(this.file_size / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  }

  get file_type_icon(): string {
    const mimeIcons = {
      'application/pdf': 'fa-file-pdf',
      'image/': 'fa-file-image',
      'text/': 'fa-file-text',
      'application/msword': 'fa-file-word',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'fa-file-word',
      'application/vnd.ms-excel': 'fa-file-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'fa-file-excel',
      'default': 'fa-file'
    };

    for (const [key, icon] of Object.entries(mimeIcons)) {
      if (this.file_mimetype?.startsWith(key)) return icon;
    }
    return mimeIcons.default;
  }

  get is_validated(): boolean {
    return this.status === DocumentCustomerStatus.ACCEPTED;
  }

  get is_pending(): boolean {
    return this.status === DocumentCustomerStatus.PENDING;
  }

  get is_rejected(): boolean {
    return this.status === DocumentCustomerStatus.REFUSED;
  }

  get is_expired(): boolean {
    return this.status === DocumentCustomerStatus.EXPIRED;
  }

  get can_be_downloaded(): boolean {
    const allowedStatuses = [
      DocumentCustomerStatus.PENDING,
      DocumentCustomerStatus.ACCEPTED
    ];
    return allowedStatuses.includes(this.status) && !!this.file_path;
  }

  get has_previous_versions(): boolean {
    return !!this.previous_version;
  }

  get file_name(): string {
    if (!this.file_path) return '';
    const path = require('path');
    return path.basename(this.file_path);
  }

  get can_be_modified(): boolean {
    return this.status !== DocumentCustomerStatus.ARCHIVED &&
           this.dossier?.status !== DossierStatus.CLOSED;
  }

  public canBeModified(): boolean {
    return this.status !== DocumentCustomerStatus.ARCHIVED &&
           this.dossier.status != 5;
  }

  @BeforeInsert()
  beforeCreate() {
    this.status = DocumentCustomerStatus.ACCEPTED;
  }
}