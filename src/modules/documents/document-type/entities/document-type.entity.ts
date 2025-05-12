// src/core/document/entities/document-type.entity.ts
import { BaseEntity } from 'src/core/entities/base.entity';
import { TypeCustomer } from 'src/modules/customer/type-customer/entities/type_customer.entity';
import { Entity, PrimaryGeneratedColumn, Column, ManyToMany, JoinTable } from 'typeorm';

export enum DocumentTypeStatus {
  PENDING = 0,
  ACCEPTED = 1,
  REFUSED = 2,
}
@Entity('document_type')
export class DocumentType extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;



  @Column({ length: 100 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ name: 'validity_duration', nullable: true })
  validityDuration: number;

  @Column({ name: 'mimetype', nullable: true, default: 'image/' })
  mimetype: string;

  @Column({ name: 'max_size', nullable: true, default: 1024*1024*3 })
  max_size: string;

  @ManyToMany(() => TypeCustomer)
  @JoinTable({
    name: 'type_customer_document_type', 
    joinColumn: { name: 'document_type_id' },
    inverseJoinColumn: { name: 'type_customer_id' }
  })
  customerTypes: TypeCustomer[];

  @Column({ name: 'is_required', default: false })
  isRequired: boolean;

  @Column({ nullable: true })
  status: number;
  
}