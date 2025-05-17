import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from 'src/core/entities/base.entity';
import { DocumentType } from 'src/modules/documents/document-type/entities/document-type.entity';
import { SavingsAccount } from '../../savings-account/entities/savings-account.entity';

export enum DocumentCustomerStatus{
  PENDING = 0,
  ACCEPTED = 1,
  REFUSED = 2,
}

@Entity('document_saving_account')
export class DocumentSavingAccount extends BaseEntity {
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

  @Column({ name: 'file_path', nullable: true })
  file_name: string;

  @Column({ name: 'file_size', nullable: true })
  file_size: number;

  @ManyToOne(() => SavingsAccount, { cascade: true })
  savings_account: SavingsAccount;

  @Column({ name: 'date_validation', nullable: true })
  date_validation: Date;

  @Column({ name: 'date_ejected', nullable: true })
  date_ejected: Date;

  @Column({ name: 'date_expired', nullable: true })
  date_expired: Date;
}