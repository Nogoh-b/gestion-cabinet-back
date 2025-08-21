import { BaseEntity } from 'src/core/entities/baseEntity';
import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { TypeGuaranty } from '../../type_guaranty/entity/type_guaranty.entity';
import { DocumentType } from '../../../../documents/document-type/entities/document-type.entity';
import { Loan } from '../../../loan/entities/loan.entity';
import { CREDIT_STATUS } from 'src/utils/types';
import { DocumentCustomer } from '../../../../documents/document-customer/entities/document-customer.entity';

@Entity()
export class GuarantyEstimation extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  value: number;

  @Column()
  status: CREDIT_STATUS;

  @ManyToOne(() => TypeGuaranty, (type) => type.guaranties)
  @JoinColumn()
  typeGuaranty: TypeGuaranty;

  @ManyToOne(() => Loan, (type) => type.guaranties)
  @JoinColumn()
  loan: Loan;

  @OneToOne(() => DocumentCustomer)
  @JoinColumn()
  document: DocumentCustomer;
}
