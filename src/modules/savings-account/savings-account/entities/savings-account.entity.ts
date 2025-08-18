import { BaseEntity } from 'src/core/entities/baseEntity';
import { Branch } from 'src/modules/agencies/branch/entities/branch.entity';

import { Customer } from 'src/modules/customer/customer/entities/customer.entity';

import { TransactionSavingsAccount } from 'src/modules/transaction/transaction_saving_account/entities/transaction_saving_account.entity';
import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  OneToMany,
  PrimaryGeneratedColumn,
  AfterLoad,
} from 'typeorm';

import { DocumentSavingAccount } from '../../document-saving-account/entities/document-saving-account.entity';
import { TypeSavingsAccount } from '../../type-savings-account/entities/type-savings-account.entity';
import { SavingsAccountHasInterest } from './account-has-interest.entity';

export enum SavingsAccountStatus {
  PENDING = 0,
  ACTIVE = 1,
  DEACTIVATE = 2,
  BLOCKED = 3,
}
@Entity('savings_account')
export class SavingsAccount extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'branch_id', type: 'int' })
  branch_id: number;

  @Column({
    name: 'number_savings_account',
    type: 'varchar',
    length: 45,
    unique: true,
  })
  number_savings_account: string;

  @Column({ name: 'fee_savings', type: 'decimal' })
  fee_savings: number;

  @Column({ name: 'amount_created', type: 'decimal' })
  amount_created: number;

  @Column({ name: 'avalaible_balance', type: 'decimal' })
  avalaible_balance: number;

  @Column({ name: 'avalaible_balance_online', type: 'decimal' })
  avalaible_balance_online: number;

  // @Column({ name: 'balance_init_savings_account', type: 'decimal' })
  balance_init_savings_account: number;

  @Column({ name: 'balance', type: 'int', default: 0 })
  balance: number;
  // @ManyToOne(() => Customer, customer => customer.savings_accounts)
  // @JoinColumn({ name: 'customer_id' })
  // customer: Customer;

  @ManyToOne(() => TypeSavingsAccount, (type) => type.savings_accounts)
  @JoinColumn({ name: 'type_savings_account_id' })
  type_savings_account: TypeSavingsAccount;

  @Column({ name: 'status', type: 'tinyint' })
  status: number;

  @Column({ name: 'iban', type: 'varchar', length: 50, unique: true })
  iban: string;

  /*@Column({ name: 'code_product', type: 'varchar', length: 45 })
  code_product: string;*/

  @Column({ type: 'varchar', nullable: true })
  code_cash: Date;

  @Column({ name: 'wallet_link', type: 'varchar', length: 45, nullable: true })
  wallet_link?: string;
  @Column({ nullable: true })
  created_online?: number;

  @Column({
    name: 'interest_year_savings_account',
    type: 'decimal',
    nullable: true,
  })
  interest_year_savings_account?: number;

  @Column({
    name: 'account_number',
    type: 'varchar',
    length: 45,
    nullable: true,
  })
  account_number?: string;

  @Column({
    name: 'is_admin',
    type: 'boolean',
    default: false,
    nullable: true,
  })
  is_admin?: boolean;

  @Column({ type: 'varchar', length: 4, nullable: true }) // Doit correspondre au type de Partner.promo_code
  partner_id: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true }) // Doit correspondre au type de Partner.promo_code
  promo_code: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true }) // Doit correspondre au type de Partner.promo_code
  commercial_code: string | null;

  /*@ManyToOne(() => Personnel,{ nullable: true })
  @JoinColumn({ name: 'promo_code', referencedColumnName: 'code' })
  partner: Personnel | null;

  @ManyToOne(() => Personnel,{ nullable: true })
  @JoinColumn({ name: 'commercial_code', referencedColumnName: 'code' })  
  commercial: Personnel | null;

  @ManyToOne(() => Partner)
  @JoinColumn({ name: 'promo_code' })
  partner1: Partner | null;

  @ManyToOne(() => Commercial)
  @JoinColumn({ name: 'commercial_code' })
  commercial1: Commercial | null;*/

  // Relations
  @ManyToOne(() => Customer)
  @JoinColumn({ name: 'customer_id' })
  customer: Customer;

  @Column({ nullable: true }) // Permet d'avoir des comptes non parrainés
  enrolled_by_id: number; // Stocke l'ID du compte parrain

  // Relation Many-to-One (optionnelle, pour faciliter les jointures)
  @ManyToOne(() => SavingsAccount, { nullable: true })
  @JoinColumn({ name: 'enrolled_by_id' })
  enrolled_by: SavingsAccount; // Référence à l'entité parente

  @ManyToOne(() => Branch)
  @JoinColumn({ name: 'branch_id' })
  branch: Branch;

  @OneToMany(
    () => DocumentSavingAccount,
    (document) => document.savings_account,
  )
  documents: DocumentSavingAccount[];

  @OneToMany(
    () => SavingsAccountHasInterest,
    (relation) => relation.savings_account,
  )
  interestRelations: SavingsAccountHasInterest[];

  @OneToMany(() => TransactionSavingsAccount, (tx) => tx.originSavingsAccount)
  originSavingsAccountTx?: TransactionSavingsAccount[]; // Transactions liées au compte

  @OneToMany(() => TransactionSavingsAccount, (tx) => tx.targetSavingsAccount)
  targetSavingsAccountTx?: TransactionSavingsAccount[]; // Transactions liées au compte

  @AfterLoad()
  setActiveInterest() {
    const now = new Date();

    this.activeInterest = this.interestRelations?.find(
      (rel) =>
        rel.status === 1 &&
        rel.begin_date instanceof Date &&
        rel.end_date instanceof Date &&
        now >= rel.begin_date &&
        now <= rel.end_date,
    );
  }

  activeInterest?: SavingsAccountHasInterest;
  /*@OneToMany(
    () => ActivitiesSavingsAccount,
    act => act.savingsAccount
  )
  activities?: ActivitiesSavingsAccount[]; // Activités du compte*/
}
