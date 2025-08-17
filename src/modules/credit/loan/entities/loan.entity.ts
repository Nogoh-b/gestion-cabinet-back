import { BaseEntity } from 'src/core/entities/baseEntity';
import { TypeCredit } from 'src/modules/credit/type_credit/entities/typeCredit.entity';
import { Customer } from 'src/modules/customer/customer/entities/customer.entity';
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
} from 'typeorm';
import { CREDIT_STATE, CREDIT_STATUS } from 'src/utils/types';
import { DocumentType } from '../../../documents/document-type/entities/document-type.entity';
import { User } from '../../../iam/user/entities/user.entity';
import { GuarantyEstimation } from '../../guaranty/garanty_estimation/entity/guaranty_estimation.entity';

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
  @OneToOne(() => User, { nullable: true })
  approvedBy: User;
  //
  @OneToOne(() => User, { nullable: true })
  manageBy: User;
  //
  @ManyToOne(() => TypeCredit, (type) => type.loans)
  typeCredit: TypeCredit;
  //
  @Column()
  nextDatePrevalent: string;
  //
  @ManyToOne(() => Customer, (type) => type.loans)
  customer: Customer;

  @OneToMany(() => DocumentType, (type) => type.loan)
  typeDocument: DocumentType[];

  @OneToMany(() => GuarantyEstimation, (type) => type.loan)
  guaranties: GuarantyEstimation[];
}
