// src/core/document/entities/document-type.entity.ts
import { TypeCustomer } from 'src/modules/customer/type-customer/entities/type_customer.entity';
import { Entity, PrimaryGeneratedColumn, Column, ManyToMany } from 'typeorm';

@Entity('document_type')
export class DocumentType {
  @PrimaryGeneratedColumn()
  id: number;

  /*@Column({ length: 45, unique: false })
  code: string;*/

  @Column({ length: 100 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ name: 'validity_duration', nullable: true })
  validityDuration: number;

  @ManyToMany(() => TypeCustomer, typeCustomer => typeCustomer.requiredDocuments)
  customerTypes: TypeCustomer[];

  @Column({ name: 'is_required', default: false })
  isRequired: boolean;

  @Column({ name: 'created_at', default: () => 'CURRENT_TIMESTAMP' })
  create_at: Date;

  @Column({ name: 'updated_at', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  update_at: Date;

  
  @Column({ nullable: true })
  status: number;
  
}