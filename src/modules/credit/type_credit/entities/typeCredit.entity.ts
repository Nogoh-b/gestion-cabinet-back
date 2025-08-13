import { Base } from 'src/core/entities/base';
import { Credit } from 'src/modules/credit/credit/entities/credit.entity';
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

@Entity()
export class TypeCredit extends Base {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column()
  interest: number;

  @Column()
  description: string;

  @Column()
  penality: number;

  @Column()
  eligibility_rating: number;

  @Column()
  reimbursement_period: MODE_REIMBURSEMENT_PERIOD;

  @Column({
    default: TYPE_CREDIT_STATE.PENDING,
  })
  status: TYPE_CREDIT_STATE;

  @OneToMany(() => Credit, (type) => type.typeCredit)
  credits: Credit[];

  @ManyToMany(() => TypeGuaranty, (type) => type.typeCredits)
  @JoinTable()
  typeGuaranties: TypeGuaranty[];
}
