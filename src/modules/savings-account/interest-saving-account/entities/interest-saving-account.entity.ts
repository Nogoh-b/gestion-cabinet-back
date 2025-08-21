import { BaseEntity } from 'src/core/entities/baseEntity';
import { Entity, Column, OneToMany } from 'typeorm';
import { SavingsAccountHasInterest } from '../../savings-account/entities/account-has-interest.entity';
import { TypeSavingsAccount } from '../../type-savings-account/entities/type-savings-account.entity';

@Entity('interest_saving_account')
export class InterestSavingAccount extends BaseEntity {
  @Column({ primary: true, generated: true })
  id: number;

  @Column({ name: 'duration_months' })
  duration_months: number;

  @Column({ type: 'decimal', precision: 5, scale: 2 })
  rate: number;

  @Column({ length: 100, nullable: true })
  description: string;

  // Relation avec les comptes (via table de jointure)
  @OneToMany(
    () => SavingsAccountHasInterest,
    (relation) => relation.interest_saving_account
  )
  accountRelations: SavingsAccountHasInterest[];

  // Relation inverse avec TypeSavingsAccount
  @OneToMany(
    () => TypeSavingsAccount,
    (typeAccount) => typeAccount.interestRate
  )
  typeAccounts: TypeSavingsAccount[];


}