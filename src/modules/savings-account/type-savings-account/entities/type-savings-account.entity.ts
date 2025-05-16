import { Entity, Column, ManyToOne, JoinColumn, BaseEntity } from 'typeorm';
import { InterestSavingAccount } from '../../interest-saving-account/entities/interest-saving-account.entity';
import { Commission } from '../../commission/entities/commission.entity';

@Entity('type_savings_account')
export class TypeSavingsAccount extends BaseEntity {
  @Column({ primary: true, generated: true })
  id: number;

  @Column({ length: 45 })
  name: string;

  @Column({ length: 45 })
  code: string;

  @Column({ length: 45 })
  periode: string;

  @Column()
  status: number;

  @Column({ name: 'interest_year_savings_account', length: 45, default: '0' })
  annualInterestRate: string;

  @Column({ name: 'minimum_blocking_duration', length: 45, nullable: true })
  minimumBlockingDuration: string;

  @Column({ name: 'initial_deposit', type: 'double', nullable: true })
  initialDeposit: number;

  @Column({ name: 'minimum_balance', type: 'double', default: 0 })
  minimumBalance: number;

  @Column({ name: 'commission_per_product', type: 'double', default: 0 })
  commissionPerProduct: number;

  @Column({ name: 'monthly_maintenance_costs', type: 'double', default: 0 })
  monthlyMaintenanceCosts: number;

  @Column({ name: 'account_closure_fees', type: 'double', default: 0 })
  accountClosureFees: number;

  // Relations
  @ManyToOne(() => Commission)
  @JoinColumn({ name: 'commission_id' })
  commission: Commission;

  @ManyToOne(() => InterestSavingAccount)
  @JoinColumn({ name: 'interest_saving_account_id' }) 
  interestRate: InterestSavingAccount;
}
