
import { BaseEntity } from 'src/core/entities/base.entity';
import { Branch } from 'src/modules/agencies/branch/entities/branch.entity';
import { Customer } from 'src/modules/customer/customer/entities/customer.entity';
import { TransactionSavingsAccount } from 'src/modules/transaction/transaction_saving_account/entities/transaction_saving_account.entity';
import { Entity, Column, ManyToOne, JoinColumn, OneToMany, PrimaryGeneratedColumn } from 'typeorm';


import { DocumentSavingAccount } from '../../document-saving-account/entities/document-saving-account.entity';
import { TypeSavingsAccount } from '../../type-savings-account/entities/type-savings-account.entity';
import { SavingsAccountHasInterest } from './account-has-interest.entity';



export enum SavingsAccountStatus {
  PENDING = 0,
  ACTIVE = 1,
  CLOSED = 2,
}
@Entity('savings_account')
export class SavingsAccount extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'branch_id', type: 'int' })
  branch_id: number;

  @Column({ name: 'number_savings_account', type: 'varchar', length: 45, unique: true })
  number_savings_account: string;

  @Column({ name: 'fee_savings', type: 'decimal' }) 
  fee_savings: number;

  @Column({ name: 'amount_created', type: 'decimal' })
  amount_created: number;

  @Column({ name: 'balance_init_savings_account', type: 'decimal' }) 
  balance_init_savings_account: number;
  
  @Column({ name: 'balance', type: 'int', default: 0 })
  balance: number;
  // @ManyToOne(() => Customer, customer => customer.savings_accounts)
  // @JoinColumn({ name: 'customer_id' })
  // customer: Customer;

  @ManyToOne(() => TypeSavingsAccount, type => type.savings_accounts)
  @JoinColumn({ name: 'type_savings_account_id' })
  type_savings_account: TypeSavingsAccount;

  @Column({ name: 'status', type: 'tinyint' })
  status: number;

  @Column({ name: 'iban', type: 'varchar', length: 14, unique: true })
  iban: string;

  @Column({ name: 'code_product', type: 'varchar', length: 45 })
  code_product: string;

  @Column({ name: 'wallet_link', type: 'varchar', length: 45, nullable: true })
  wallet_link?: string;

  @Column({ name: 'interest_year_savings_account', type: 'decimal', nullable: true })
  interest_year_savings_account?: number;

  @Column({ name: 'account_number', type: 'varchar', length: 45, nullable: true })
  account_number?: string;

  // Relation unique active interest history
  // @OneToOne(() => SavingsAccountHasInterest, rel => rel.savings_asavings_accountccount)
  // active_interest?: SavingsAccountHasInterest;
  


  // Relations
  @ManyToOne(() => Customer)
  @JoinColumn({ name: 'customer_id' })
  customer: Customer;



  @ManyToOne(() => Branch)
  @JoinColumn({ name: 'branch_id' })
  branch: Branch;

  

  @OneToMany(
    () => DocumentSavingAccount,
    (document) => document.savings_account
  )
  documents: DocumentSavingAccount[];

  @OneToMany(
    () => SavingsAccountHasInterest,
    (relation) => relation.savings_account
  )
  interestRelations: SavingsAccountHasInterest[];

    @OneToMany(
    () => TransactionSavingsAccount,
    tx => tx.originSavingsAccount
  )
  originSavingsAccount?: TransactionSavingsAccount[]; // Transactions liées au compte

    @OneToMany(
    () => TransactionSavingsAccount,
    tx => tx.targetSavingsAccount
  )
  targetSavingsAccount?: TransactionSavingsAccount[]; // Transactions liées au compte

  /*@OneToMany(
    () => ActivitiesSavingsAccount,
    act => act.savingsAccount
  )
  activities?: ActivitiesSavingsAccount[]; // Activités du compte*/

}