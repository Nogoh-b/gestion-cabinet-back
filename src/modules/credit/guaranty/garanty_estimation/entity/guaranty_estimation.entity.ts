import { BaseEntity } from 'src/core/entities/baseEntity';
import { CREDIT_STATUS } from 'src/utils/types';
import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';







import { DocumentCustomer } from '../../../../documents/document-customer/entities/document-customer.entity';
import { Loan } from '../../../loan/entities/loan.entity';
import { TypeGuaranty } from '../../type_guaranty/entity/type_guaranty.entity';








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
  documents: DocumentCustomer;
}
