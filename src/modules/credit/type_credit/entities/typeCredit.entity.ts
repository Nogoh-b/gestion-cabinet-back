import { BaseEntity } from 'src/core/entities/baseEntity';
import { Loan } from 'src/modules/credit/loan/entities/loan.entity';
import {
  Column,
  Entity,
  JoinTable,
  ManyToMany,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { MODE_REIMBURSEMENT_PERIOD, TYPE_CREDIT_STATE } from 'src/utils/types';
import { TypeGuaranty } from '../../guaranty/type_guaranty/entity/type_guaranty.entity';
import { DocumentType } from '../../../documents/document-type/entities/document-type.entity';

@Entity()
export class TypeCredit extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column()
  interest: number;

  @Column({
    type: 'text',
  })
  description: string;

  @Column()
  penality: number;

  @Column()
  code: string;

  @Column()
  fee: number;

  @Column()
  eligibility_rating: number;

  @Column()
  reimbursement_period: MODE_REIMBURSEMENT_PERIOD;

  @Column({
    default: TYPE_CREDIT_STATE.PENDING,
  })
  status: TYPE_CREDIT_STATE;

  @OneToMany(() => Loan, (type) => type.typeCredit)
  loans: Loan[];

  @ManyToMany(() => TypeGuaranty, (type) => type.typeCredits)
  @JoinTable()
  typeGuaranties: TypeGuaranty[];

  @ManyToMany(() => DocumentType, (type) => type.typeCredits)
  @JoinTable()
  typeOfDocuments: DocumentType[];
}
