import { Base } from 'src/core/entities/base';
import { Customer } from 'src/modules/customer/customer/entities/customer.entity';
import { DocumentType } from 'src/modules/documents/document-type/entities/document-type.entity';
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';

import { SavingsAccount } from '../../savings-account/entities/savings-account.entity';


export enum DocumentCustomerStatus{
  PENDING = 0,
  ACCEPTED = 1,
  REFUSED = 2,
}

@Entity('document_saving_account')
export class DocumentSavingAccount extends Base {
    @PrimaryGeneratedColumn()
    id: number;
    @Column({ length: 100 })
    name: string;

    @ManyToOne(() => DocumentType)
    @JoinColumn({ name: 'document_type_id' })
    document_type: DocumentType;

    @Column({ type: 'tinyint', default: 0 })
    status: number;


    @Column({ name: 'file_path', length: 255 })
    file_path: string;

    @Column({ name: 'file_size', type: 'int' })
    file_size: number;

    @ManyToOne(() => Customer)
    @JoinColumn({ name: 'customer_id' })
    customer: Customer;

    @Column({ name: 'date_validation', type: 'timestamp', nullable: true })
    date_validation: Date | null;

    @Column({ name: 'date_ejected', type: 'timestamp', nullable: true })
    date_ejected: Date | null;

    @Column({ name: 'date_expired', type: 'timestamp', nullable: true })
    date_expired: Date | null;

    @ManyToOne(() => SavingsAccount)
    @JoinColumn([
    { name: 'savings_account_id', referencedColumnName: 'id' },
  ])
  savings_account: SavingsAccount;
  }