// Entité TransactionType - src/core-banking/entities/transaction-type.entity.ts
// Cette entité représente un type de transaction (ex: dépôt, retrait, virement)
import { Entity, PrimaryGeneratedColumn, Column, OneToMany, ManyToOne, JoinColumn } from 'typeorm';










import { TransactionSavingsAccount } from '../../transaction_saving_account/entities/transaction_saving_account.entity';









export enum TransactionCode {
  CASH_DEPOSIT = 'CASH_DEPOSIT',
  CASH_WITHDRAWAL = 'CASH_WITHDRAWAL',
  CHEQUE_DEPOSIT = 'CHEQUE_DEPOSIT',
  CHEQUE_CLEARING = 'CHEQUE_CLEARING',
  INTERNAL_TRANSFER = 'INTERNAL_TRANSFER',
  DOMESTIC_TRANSFER = 'DOMESTIC_TRANSFER',
  INTERNATIONAL_TRANSFER = 'INTERNATIONAL_TRANSFER',
  STANDING_ORDER = 'STANDING_ORDER',
  DIRECT_DEBIT = 'DIRECT_DEBIT',
  CARD_PAYMENT = 'CARD_PAYMENT',
  CARD_REFUND = 'CARD_REFUND',
  INTERBANK_DEBIT = 'INTERBANK_DEBIT',
  LOAN_DISBURSEMENT = 'LOAN_DISBURSEMENT',
  LOAN_PRINCIPAL_REPAYMENT = 'LOAN_PRINCIPAL_REPAYMENT',
  LOAN_INTEREST_PAYMENT = 'LOAN_INTEREST_PAYMENT',
  INTEREST_CREDIT = 'INTEREST_CREDIT',
  INTEREST_DEBIT = 'INTEREST_DEBIT',
  ACCOUNT_MAINTENANCE_FEE = 'ACCOUNT_MAINTENANCE_FEE',
  OVERDRAFT_FEE = 'OVERDRAFT_FEE',
  LATE_PAYMENT_PENALTY = 'LATE_PAYMENT_PENALTY',
  FX_BUY = 'FX_BUY',
  FX_SELL = 'FX_SELL',
  E_WALLET_DEPOSIT = 'E_WALLET_DEPOSIT',
  E_WALLET_WITHDRAWAL = 'E_WALLET_WITHDRAWAL',
  INTERNET_BANKING_PAYMENT = 'INTERNET_BANKING_PAYMENT',
  TRANSACTION_REVERSAL = 'TRANSACTION_REVERSAL',
  MANUAL_ADJUSTMENT = 'MANUAL_ADJUSTMENT',
  BATCH_SETTLEMENT = 'BATCH_SETTLEMENT',
  CASHBACK = 'CASHBACK',
  CHARGEBACK = 'CHARGEBACK',
  AGENCY_COMMISSION = 'AGENCY_COMMISSION',
  LOYALTY_POINTS_TRANSFER = 'LOYALTY_POINTS_TRANSFER',
  PRODUCT_OPEN = 'PRODUCT_OPEN',
  PRODUCT_CLOSE = 'PRODUCT_CLOSE',
  MOMO_DEPOSIT = 'MOMO_DEPOSIT',
  OM_DEPOSIT = 'OM_DEPOSIT',
  MOMO_WITHDRAW = 'MOMO_WITHDRAW',
  OM_WITHDRAW = 'OM_WITHDRAW',

}
export enum TransactionChannel {
  BRANCH = 'BRANCH',
  MOBILE = 'MOBILE',
  ATM = 'ATM',
  API = 'API'
}

export enum TransactionProvider {
  MOMO = 'MOMO',
  OM = 'OM',
  WALLET = 'WALLET',
}

@Entity('transaction_type')
// @Unique(['code'])
export class TransactionType {
  @PrimaryGeneratedColumn()
  id: number; // Identifiant unique

  @Column({ length: 50 })
  code: string; // Code du type (ex: DEPOT, RETRAIT)

  @Column({ length: 45 })
  name: string; // Nom complet du type (ex: "Dépôt en espèce")

  @Column('text', { nullable: true })
  description?: string; // Description détaillée

  @Column({ type: 'tinyint' })
  is_credit: number; // 1 = Crédit, 0 = Débit

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  fee_percentage: number; // Pourcentage des frais appliqués

  @OneToMany(() => TransactionSavingsAccount, tx => tx.transactionType)
  transactions?: TransactionSavingsAccount[]; // Relations avec les transactions

  @ManyToOne(() => TransactionType, tt => tt.transactions)
  @JoinColumn({ name: 'transaction_type_id', referencedColumnName: 'id' })
  transactionType: TransactionType; // Relation vers TransactionType

  @Column({ type: 'tinyint', nullable: true })
  status?: number;
}