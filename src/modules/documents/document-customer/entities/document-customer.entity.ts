import { BaseEntity } from 'src/core/entities/baseEntity';
import { DossierStatus } from 'src/core/enums/dossier-status.enum';
import { Audience } from 'src/modules/audiences/entities/audience.entity';
import { Customer } from 'src/modules/customer/customer/entities/customer.entity';

import { DocumentCategory } from 'src/modules/document-category/entities/document-category.entity';






import { Dossier } from 'src/modules/dossiers/entities/dossier.entity';


import { User } from 'src/modules/iam/user/entities/user.entity';
import { Step } from 'src/modules/step/entities/step.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToMany,
} from 'typeorm';



import { DocumentType } from '../../document-type/entities/document-type.entity';











// import { Hearing } from 'src/modules/hearings/entities/hearing.entity';
// import { User } from 'src/modules/users/entities/user.entity';
// import { Comment } from 'src/modules/comments/entities/comment.entity';

export enum DocumentCustomerStatus {
  PENDING = 0,
  ACCEPTED = 1,
  REFUSED = 2,
  EXPIRED = 3,
  ARCHIVED = 4,
}

// export enum DocumentCategory {
//   PROCEDURAL = 'procedural', // Actes de procédure officiels
//   CLIENT = 'client', // Documents transmis par le client
//   INTERNAL = 'internal', // Documents internes/annexes
//   FINANCIAL = 'financial', // Documents financiers
//   DECISION = 'decision', // Décisions de justice
// }

@Entity('document_customer')
export class DocumentCustomer extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;
  @Column({ type: 'int', nullable: true })
  document_type_id?: number;

  @Column({ type: 'int', nullable: true })
  customer_id?: number;

  @Column({ type: 'int', nullable: true })
  dossier_id?: number;

  @Column({ type: 'int', nullable: true })
  uploaded_by_id?: number;


  @Column({ type: 'text', nullable: true })
  description: string;

  @ManyToOne(() => DocumentType)
  @JoinColumn({ name: 'document_type_id' })
  document_type: DocumentType;

  @ManyToOne(() => Customer)
  @JoinColumn({ name: 'customer_id' })
  customer: Customer;
  
  // @Column({
  //   type: 'enum',
  //   enum: DocumentCategory,
  //   default: DocumentCategory.CLIENT
  // })
  @Column({ type: 'int', nullable: true })
  category_id?: number;
  
  @ManyToOne(() => DocumentCategory)
  @JoinColumn({ name: 'category_id' })
  category: DocumentCategory;

  @Column({ 
    type: 'enum',
    enum: DocumentCustomerStatus,
    default: DocumentCustomerStatus.PENDING
  })
  status: DocumentCustomerStatus;

  @Column({ name: 'file_path', nullable: true })
  file_path: string;

  @Column({ name: 'file_size', nullable: true })
  file_size: number;

  @Column({ name: 'file_mimetype', nullable: true })
  file_mimetype: string;

  @Column({ name: 'version', default: 1 })
  version: number;

  @Column({ name: 'is_current_version', default: true })
  is_current_version: boolean;

  @ManyToOne(() => DocumentCustomer, { nullable: true })
  @JoinColumn({ name: 'previous_version_id' })
  previous_version: DocumentCustomer;



  @ManyToOne(() => Dossier, { nullable: false })
  @JoinColumn({ name: 'dossier_id' })
  dossier: Dossier;

  // @ManyToOne(() => Hearing, { nullable: true })
  // @JoinColumn({ name: 'hearing_id' })
  // related_hearing: Hearing;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'uploaded_by_id' })
  uploaded_by: User;

  @ManyToOne(() => Step, { nullable: true })
  @JoinColumn({ name: 'step_id' })
  step: Step;

  @Column({ name: 'uploaded_at', type: 'timestamp' })
  @CreateDateColumn()
  uploaded_at: Date;

  @Column({ name: 'last_modified', type: 'timestamp' })
  @UpdateDateColumn()
  last_modified: Date;

  @Column({ name: 'date_validation', nullable: true })
  date_validation: Date;

  @Column({ name: 'date_ejected', nullable: true })
  date_ejected: Date;

  @Column({ name: 'date_expired', nullable: true })
  date_expired: Date;

  @Column({ name: 'required_for_hearing', default: false })
  required_for_hearing: boolean;

  @Column({ name: 'is_confidential', default: false })
  is_confidential: boolean;

  @Column({ name: 'metadata', type: 'json', nullable: true })
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

// get is_procedural_document(): boolean {
//   return this.category === DocumentCategory.PROCEDURAL;
// }

// get is_client_document(): boolean {
//   return this.category === DocumentCategory.CLIENT;
// }

// get is_internal_document(): boolean {
//   return this.category === DocumentCategory.INTERNAL;
// }

get can_be_modified(): boolean {
  return this.status !== DocumentCustomerStatus.ARCHIVED && 
         this.dossier?.status !== DossierStatus.CLOSED; // Adaptez selon votre statut de dossier
}

// get requires_validation(): boolean {
//   return this.is_procedural_document || this.is_client_document;
// }
  // @OneToMany(() => Comment, (comment) => comment.document)
  // comments: Comment[];

  // Méthodes utilitaires
  // public isProceduralDocument(): boolean {
  //   return this.category === DocumentCategory.PROCEDURAL;
  // }

  // public isClientDocument(): boolean {
  //   return this.category === DocumentCategory.CLIENT;
  // }

  // public isInternalDocument(): boolean {
  //   return this.category === DocumentCategory.INTERNAL;
  // }

  public canBeModified(): boolean {
    return this.status !== DocumentCustomerStatus.ARCHIVED && 
           this.dossier.status != 5;
  }

  // public requiresValidation(): boolean {
  //   return this.isProceduralDocument() || this.isClientDocument();
  // }
}