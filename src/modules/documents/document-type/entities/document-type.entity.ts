// src/core/document/entities/document-type.entity.ts
import { BaseEntity } from 'src/core/entities/baseEntity';
import { TypeCustomer } from 'src/modules/customer/type-customer/entities/type_customer.entity';
import { Entity, PrimaryGeneratedColumn, Column, ManyToMany, JoinTable, OneToMany } from 'typeorm';





import { DocumentCustomer } from '../../document-customer/entities/document-customer.entity';
import { DocumentCategory } from 'src/modules/document-category/entities/document-category.entity';






export enum DocumentTypeStatus {
  PENDING = 0,
  ACCEPTED = 1,
  REFUSED = 2,
}

export enum DocumentTypeCode {
  CNI_AVANT = "CNI AVANT",
  CNI_ARRIERE = "CNI ARRIERE",
  SELFIE_AVEC_CNI = "SELFIE AVEC CNI",
  PHOTO_4X4 = "PHOTO 4X4",
  RCCM = "RCCM",
  PL_LOCALISATION = "PL LOCALISATION",
  NIU = "NIU",
  JDR = "JDR",
  SIGNATURE = "SIGNATURE",
  ATTEST_DOMI = "ATTEST DOMI",
  CAUTION = "CAUTION",
}
@Entity('document_type')
export class DocumentType extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 100 })
  code: string;

  @Column({ length: 100 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ name: 'validity_duration', nullable: true })
  validityDuration: number;

  @Column({ name: 'mimetype', nullable: true, default: 'image/' })
  mimetype: string;

  @Column({ name: 'max_size', nullable: true, default: 1024 * 1024 * 3 })
  max_size: string;

  
  // === NOUVELLE RELATION ===
  // @ManyToOne(() => DocumentCategory, (category) => category.documentTypes, { nullable: false })
  // @JoinColumn({ name: 'document_category_id' })
  // category: DocumentCategory;

  @ManyToMany(() => DocumentCategory, (category) => category.documentTypes)
  @JoinTable({
    name: 'document_type_categories', // Table de liaison
    joinColumn: { name: 'document_type_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'document_category_id', referencedColumnName: 'id' },
  })
  categories: DocumentCategory[];
  documentCategoryCodes?: string[];

  @Column({ name: 'document_category_id', nullable: true }) // Ajouter nullable: true
  documentCategoryId: number;
  // ========================

  @ManyToMany(() => TypeCustomer)
  @JoinTable({
    name: 'type_customer_document_type',
    joinColumn: { name: 'document_type_id' },
    inverseJoinColumn: { name: 'type_customer_id' },
  })
  customerTypes: TypeCustomer[];

  @Column({ name: 'is_required', default: false })
  isRequired: boolean;

  @Column({ nullable: true })
  status: number;
  // @ManyToMany(() => TypeSavingsAccount, type => type.documentTypes)
  // typeAccounts: TypeSavingsAccount[];
  @OneToMany(() => DocumentCustomer, (doc) => doc.document_type, {
    nullable: true,
  })

  documents: DocumentCustomer[];


}
