import { Customer } from 'src/modules/customer/customer/entities/customer.entity';
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { DocumentType } from '../../document-type/entities/document-type.entity';
import { BaseEntity } from 'src/core/entities/base.entity';

@Entity('document_customer')
export class DocumentCustomer extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @ManyToOne(() => DocumentType)
  @JoinColumn({ name: 'document_type_id' })
  documentType: DocumentType;

  @Column({ default: 0 })
  status: number;

  @Column({ name: 'file_path', nullable: true })
  file_path: string;


  @ManyToOne(() => Customer)
  @JoinColumn({ name: 'customer_id' })
  customer: Customer;

  @Column({ name: 'date_validation', nullable: true })
  dateValidation: Date;

  @Column({ name: 'date_ejected', nullable: true })
  dateEjected: Date;

  @Column({ name: 'date_expired', nullable: true })
  dateExpired: Date;
}