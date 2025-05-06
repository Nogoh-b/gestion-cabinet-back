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
} from 'typeorm';

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
    inverseJoinColumn: { name: 'document_type_id' }
  })
  requiredDocuments: DocumentType[];
  

  @CreateDateColumn({ name: 'created_at' })
  create_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  update_at: Date;

  @Column({ type: 'tinyint', nullable: true })
  status: number;
}