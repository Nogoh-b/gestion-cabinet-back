// type-customer.entity.ts
import { DocumentType } from 'src/modules/documents/document-type/entities/document-type.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToMany,
  JoinTable,
  OneToMany,
} from 'typeorm';

import { Customer } from '../../customer/entities/customer.entity';


@Entity('type_customer')
export class TypeCustomer {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 45, nullable: true })
  name: string;

  @Column({ length: 45, nullable: true })
  code: string;

  @ManyToMany(() => DocumentType)
  @JoinTable({
    name: 'type_customer_document_type',
    joinColumn: { name: 'type_customer_id' },
    inverseJoinColumn: { name: 'document_type_id' },
  })
  requiredDocuments: DocumentType[];

  @OneToMany(() => Customer, (c:Customer) => c.type_customer)
  customers: Customer[];

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;

  @Column({ type: 'tinyint', nullable: true, default: 1 })
  status: number;
}