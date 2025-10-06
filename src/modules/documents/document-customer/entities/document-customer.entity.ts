import { Customer } from 'src/modules/customer/customer/entities/customer.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn
} from 'typeorm';
import { DocumentType } from '../../document-type/entities/document-type.entity';
import { BaseEntity } from 'src/core/entities/baseEntity';
import { Loan } from '../../../credit/loan/entities/loan.entity';
import { User } from 'src/modules/iam/user/entities/user.entity';
import { Audience } from 'src/modules/audiences/entities/audience.entity';
import { Dossier } from 'src/modules/dossiers/entities/dossier.entity';
// import { Dossier } from '../../../dossiers/entities/dossier.entity';
// import { Audience } from '../../../audiences/entities/audience.entity';

export enum DocumentCustomerStatus  {
  PENDING = 0,      // En attente
  VALIDATED = 1,  // Validé
  REJECTED = 2,    // Rejeté
  EXPIRED = 3,      // Expiré
  ARCHIVED = 4,    // Archivé
  ACCEPTED = 1,
  REFUSED = 2,
}

export enum DocumentCategory {
  PROCEDURE = 'procedure',      // Actes de procédure
  CLIENT = 'client',           // Documents client
  INTERNE = 'interne',         // Documents internes
  FACTURE = 'facture',         // Factures
  AUDIENCE = 'audience',       // Documents d'audience
  DECISION = 'decision',       // Décisions de justice
}

@Entity('document_customer')
export class DocumentCustomer extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: false })
  filename: string;

  @Column({ name: 'original_name', nullable: false })
  originalName: string;

  @Column({ name: 'file_path', nullable: true })
  file_path: string;

  @Column({ name: 'file_size', nullable: true })
  fileSize: number;

  @Column({ name: 'mime_type', nullable: true })
  mimeType: string;

  // ✅ CATEGORIE selon les specs
  @Column({ 
    type: 'enum', 
    enum: DocumentCategory, 
    default: DocumentCategory.CLIENT 
  })
  category: DocumentCategory;

  // ✅ TYPE de document (relation existante conservée)
  @ManyToOne(() => DocumentType, { eager: true })
  @JoinColumn({ name: 'document_type_id' })
  document_type: DocumentType;

  // ✅ STATUT amélioré
  @Column({ 
    type: 'enum', 
    enum: DocumentCustomerStatus, 
    default: DocumentCustomerStatus.PENDING 
  })
  status: DocumentCustomerStatus;
  @Column()
  name: string;
  // ✅ RELATION avec DOSSIER (obligatoire selon specs)
  @ManyToOne(() => Dossier, (dossier) => dossier.documents)
  @JoinColumn({ name: 'dossier_id' })
  dossier: Dossier;
  @Column({ name: 'date_ejected', nullable: true })
  date_ejected: Date;
  @Column({ name: 'date_validation', nullable: true })
  date_validation: Date;
  // ✅ RELATION avec CLIENT (optionnel - peut être lié via le dossier)
  @ManyToOne(() => Customer, { nullable: true }) 
  @JoinColumn({ name: 'customer_id' })
  customer: Customer;

  // ✅ RELATION avec UTILISATEUR (qui a uploadé le document)
  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'uploaded_by_id' })
  uploadedBy: User;

  // ✅ RELATION avec AUDIENCE (si document lié à une audience)
  @ManyToOne(() => Audience, { nullable: true })
  @JoinColumn({ name: 'audience_id' })
  audience: Audience;

  // ✅ VERSIONNING selon specs R6
  @Column({ default: 1 })
  version: number;

  @Column({ name: 'previous_version_id', nullable: true })
  previousVersionId: number;

  // ✅ METADONNEES selon specs
  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ name: 'keywords', type: 'text', nullable: true })
  keywords: string; // Mots-clés pour la recherche

  @Column({ name: 'document_date', type: 'date', nullable: true })
  documentDate: Date; // Date du document (différent de created_at)

  // ✅ DATES de gestion
  @Column({ name: 'validation_date', nullable: true })
  validationDate: Date;

  @Column({ name: 'rejection_date', nullable: true })
  rejectionDate: Date;

  @Column({ name: 'expiration_date', nullable: true })
  expirationDate: Date;

  @Column({ name: 'archival_date', nullable: true })
  archivalDate: Date;

  // ✅ RAISON du rejet si applicable
  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason: string;

  // ✅ RELATIONS existantes conservées (si toujours nécessaires)
  @ManyToOne(() => Loan, (loan) => loan.documents, { nullable: true })
  loan: Loan;

  // ✅ GETTERS utilitaires
  get isPending(): boolean {
    return this.status === DocumentCustomerStatus.PENDING;
  }

  get isValidated(): boolean {
    return this.status === DocumentCustomerStatus.VALIDATED;
  }

  get isRejected(): boolean {
    return this.status === DocumentCustomerStatus.REJECTED;
  }

  get isExpired(): boolean {
    return this.status === DocumentCustomerStatus.EXPIRED;
  }

  get canBeDownloaded(): boolean {
    return this.status !== DocumentCustomerStatus.PENDING;
  }

  // ✅ Méthode pour créer une nouvelle version
  createNewVersion(newFilePath: string, newFileName: string): Partial<DocumentCustomer> {
    return {
      filename: newFileName,
      originalName: newFileName,
      file_path: newFilePath,
      fileSize: this.fileSize,
      mimeType: this.mimeType,
      version: this.version + 1,
      previousVersionId: this.id,
      status: DocumentCustomerStatus.PENDING, // Nouvelle version à valider
      uploadedBy: this.uploadedBy,
      // dossier: this.dossier,
      customer: this.customer,
      document_type: this.document_type,
      category: this.category,
    };
  }
}