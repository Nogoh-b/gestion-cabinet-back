import { Entity, ManyToOne, Column, JoinColumn, PrimaryColumn } from 'typeorm';




import { InterestSavingAccount } from '../../interest-saving-account/entities/interest-saving-account.entity';
import { SavingsAccount } from './savings-account.entity';





@Entity('savings_account_has_interest_saving_account')
export class SavingsAccountHasInterest {
  @PrimaryColumn()
  savings_account_id: number;

  @PrimaryColumn()
  interest_saving_account_id: number;

  @Column({ type: 'timestamp', nullable: true })
  begin_date: Date;

  @Column({ type: 'timestamp', nullable: true })
  end_date: Date;

  @Column({ type: 'timestamp', nullable: true })
  code_cash: Date;

  @Column({ nullable: true })
  status: number;

  
  @ManyToOne(
    () => SavingsAccount,
    (account) => account.interestRelations,
    { onDelete: 'NO ACTION', onUpdate: 'NO ACTION' }
  )
  @JoinColumn({ name: 'savings_account_id' })
  
  savings_account: SavingsAccount;

  @ManyToOne(
    () => InterestSavingAccount,
    (interest) => interest.accountRelations,
    { onDelete: 'NO ACTION', onUpdate: 'NO ACTION' }
  )
  @JoinColumn({ name: 'interest_saving_account_id' })
  interest_saving_account: InterestSavingAccount;
  
}