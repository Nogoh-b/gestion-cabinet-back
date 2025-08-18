import { Customer } from 'src/modules/customer/customer/entities/customer.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { DocumentType } from '../../document-type/entities/document-type.entity';
import { BaseEntity } from 'src/core/entities/baseEntity';
import { Loan } from '../../../credit/loan/entities/loan.entity';

export enum DocumentCustomerStatus {
  PENDING = 0,
  ACCEPTED = 1,
  REFUSED = 2,
}

@Entity('document_customer')
export class DocumentCustomer extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @ManyToOne(() => DocumentType)
  @JoinColumn({ name: 'document_type_id' })
  document_type: DocumentType;

  @Column({ default: 0 })
  status: number;

  @Column({ name: 'file_path', nullable: true })
  file_path: string;

  @Column({ name: 'file_size', nullable: true })
  file_size: number;

  @ManyToOne(() => Customer)
  @JoinColumn({ name: 'customer_id' })
  customer: Customer;

  @Column({ name: 'date_validation', nullable: true })
  date_validation: Date;

  @Column({ name: 'date_ejected', nullable: true })
  date_ejected: Date;

  @Column({ name: 'date_expired', nullable: true })
  date_expired: Date;

  @ManyToOne(() => Loan, (type) => type.documents, {
    nullable: true,
  })
  loan: Loan;
}
