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

  @PrimaryColumn({ name: 'branch_id' })
  branchId: number;

  @Column({ name: 'number_savings_account', length: 45, unique: true })
  number: string;

  @Column({ name: 'fee_savings', type: 'decimal', precision: 15, scale: 2 })
  fee: number;

  @Column({ name: 'amount_created', type: 'decimal', precision: 15, scale: 2 })
  initialAmount: number;

  @Column({ name: 'balance_init_savings_account', type: 'decimal', precision: 15, scale: 2 })
  initialBalance: number;

  @Column({ name: 'IBAN', length: 45, unique: true })
  iban: string;

  @Column({ name: 'code_product', length: 45 })
  productCode: string;

  @Column({ name: 'wallet_link', length: 45, nullable: true })
  walletLink: string;

  @Column({ name: 'interest_year_savings_account', type: 'decimal', precision: 5, scale: 2, nullable: true })
  annualInterestRate: number;

  @Column({ name: 'account_number', length: 45, nullable: true })
  accountNumber: string;

  @Column()
  status: number;

  // Relations
  @ManyToOne(() => Customer)
  @JoinColumn({ name: 'customer_id' })
  customer: Customer;

  @ManyToOne(() => TypeSavingsAccount)
  @JoinColumn({ name: 'type_savings_account_id' })
  accountType: TypeSavingsAccount;

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