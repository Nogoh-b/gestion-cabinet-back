// src/core/document/entities/document-type.entity.ts
import { BaseEntity } from 'src/core/entities/baseEntity';
import { TypeCustomer } from 'src/modules/customer/type-customer/entities/type_customer.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToMany,
  JoinTable
} from 'typeorm';
import { TypeCredit } from '../../../credit/type_credit/entities/typeCredit.entity';

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
  @ManyToMany(() => TypeCredit, (type) => type.typeOfDocuments, {
    nullable: true,
  })
  typeCredits: TypeCredit[];
}
