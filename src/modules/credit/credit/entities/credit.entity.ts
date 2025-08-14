import { Base } from 'src/core/entities/base';
import { TypeCredit } from 'src/modules/credit/type_credit/entities/typeCredit.entity';
import { Customer } from 'src/modules/customer/customer/entities/customer.entity';
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
  OneToOne,
} from 'typeorm';
import { CREDIT_STATE, CREDIT_STATUS } from 'src/utils/types';
import { DocumentType } from '../../../documents/document-type/entities/document-type.entity';
import { User } from '../../../iam/user/entities/user.entity';
import { GuarantyEstimation } from '../../guaranty/garanty_estimation/entity/guaranty_estimation.entity';

@Entity()
export class Credit extends Base {
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
  @OneToOne(() => User, { nullable: true })
  approvedBy: User;
  //
  @ManyToOne(() => TypeCredit, (type) => type.credits)
  typeCredit: TypeCredit;
  //
  @Column()
  nextDatePrevalent: string;
  //
  @ManyToOne(() => Customer, (type) => type.credits)
  customer: Customer;

  @OneToMany(() => DocumentType, (type) => type.credit)
  typeDocument: DocumentType[];

  @OneToMany(() => GuarantyEstimation, (type) => type.credit)
  guaranties: GuarantyEstimation[];
}
