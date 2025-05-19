
import { BaseEntity } from 'src/core/entities/base.entity';
import { Entity, Column, ManyToOne, JoinColumn, PrimaryColumn, OneToMany } from 'typeorm';
import { TypeSavingsAccount } from '../../type-savings-account/entities/type-savings-account.entity';
import { Customer } from 'src/modules/customer/customer/entities/customer.entity';
import { Branch } from 'src/modules/agencies/branch/entities/branch.entity';
import { DocumentSavingAccount } from '../../document-saving-account/entities/document-saving-account.entity';
import { SavingsAccountHasInterest } from './account-has-interest.entity';

@Entity('savings_account')
export class SavingsAccount extends BaseEntity {
  @PrimaryColumn()
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
}