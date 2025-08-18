import { BaseEntity } from 'src/core/entities/baseEntity';
import { TypeCredit } from 'src/modules/credit/type_credit/entities/typeCredit.entity';
import { Customer } from 'src/modules/customer/customer/entities/customer.entity';
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  OneToMany,
  OneToOne, JoinColumn,
} from 'typeorm';
import { CREDIT_STATE, CREDIT_STATUS } from 'src/utils/types';
import { DocumentType } from '../../../documents/document-type/entities/document-type.entity';
import { User } from '../../../iam/user/entities/user.entity';
import { GuarantyEstimation } from '../../guaranty/garanty_estimation/entity/guaranty_estimation.entity';
import { TransactionSavingsAccount } from '../../../transaction/transaction_saving_account/entities/transaction_saving_account.entity';
import { DocumentCustomer } from '../../../documents/document-customer/entities/document-customer.entity';

@Entity()
export class Loan extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  amount: number;

  @Column()
  reimbursement_amount: number;
  //
  @Column()
  status: CREDIT_STATUS;
  //
  @Column()
  state: CREDIT_STATE;
  // During in days
  @Column()
  duringMax: number;
  //
  @Column({
    type: 'text',
  })
  object: string;

  @Column({
    type: 'text',
  })
  comment: string;
  //
  @Column({
    type: 'text',
  })
  reference: string;
  //
  @OneToOne(() => User, { nullable: true })
  @JoinColumn()
  approvedBy: User;
  //
  @OneToOne(() => User, { nullable: true })
  @JoinColumn()
  manageBy: User;
  //
  @ManyToOne(() => TypeCredit, (type) => type.loans)
  typeCredit: TypeCredit;
  //
  @Column({ type: 'datetime', nullable: true })
  nextDatePrevalent: Date;
  //
  @Column()
  remainPaymentNumber: number;
  //
  @ManyToOne(() => Customer, (type) => type.loans)
  customer: Customer;

  @OneToMany(() => DocumentCustomer, (type) => type.loan)
  documents: DocumentCustomer[];

  @OneToMany(() => TransactionSavingsAccount, (type) => type.loan)
  transactions: TransactionSavingsAccount[];

  @OneToMany(() => GuarantyEstimation, (type) => type.loan)
  guaranties: GuarantyEstimation[];
}
