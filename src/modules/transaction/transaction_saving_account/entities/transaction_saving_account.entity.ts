// Entité TransactionSavingsAccount - src/core-banking/entities/transaction-savings-account.entity.ts
// Représente une transaction sur un compte d'épargne
import { Provider } from 'src/modules/provider/provider/entities/provider.entity';
import { SavingsAccount } from 'src/modules/savings-account/savings-account/entities/savings-account.entity';
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';



import { ChannelTransaction } from '../../chanel-transaction/entities/channel-transaction.entity';
import { TransactionType } from '../../transaction_type/entities/transaction_type.entity';




@Entity('transaction_savings_account')
export class TransactionSavingsAccount {
  @PrimaryGeneratedColumn()
  id: number; // Identifiant unique

  @Column({ type: 'int'})
  amount: number; // Montant de la transaction

  @Column({ type: 'tinyint', default : 0 })
  status: number; // Statut : 0=En attente,1=Confirmée,2=Échouée

  // @Column({ length: 45, nullable: true, default: 'code : mobile money' })
  // origin_code_transaction: string; // Code d'origine de la transaction

  @Column({ length: 45, nullable: true })
  external_activities_id: string; // ID de l'activité externe

  @Column({ default:false })
  is_locked: boolean; // Numéro de compte externe

  @Index()
  @Column()
  channels_transaction_id: number; // Référence du canal de transaction

  @Index()
  @Column({ length: 45 })
  provider_code: string; // Code du provider

  @Index()
  @Column({ length: 100 })
  payment_code: string; 

  @Index()
  @Column({ length: 100 })
  payment_token_provider: string; 

  @Index()
  @Column({ length: 100 })
  reference: string; // Code du provider

  @Index()
  @Column()
  transaction_type_id: number; // Référence du type de transaction

  @CreateDateColumn()
  created_at: Date; // Date de création

  @UpdateDateColumn()
  updated_at: Date; // Date de mise à jour

  @ManyToOne(() => SavingsAccount, acc => acc.originSavingsAccount)
  @JoinColumn({ name: 'origin_savings_account_id', referencedColumnName: 'id' })
  originSavingsAccount: SavingsAccount; // Relation vers SavingsAccount

  @ManyToOne(() => SavingsAccount, acc => acc.targetSavingsAccount)
  @JoinColumn({ name: 'target_savings_account_id', referencedColumnName: 'id' })
  targetSavingsAccount: SavingsAccount; // Relation vers SavingsAccount

  @ManyToOne(() => ChannelTransaction, ch => ch.transactions)
  @JoinColumn({ name: 'channels_transaction_id', referencedColumnName: 'id' })
  channelTransaction: ChannelTransaction; // Relation vers ChannelsTransaction

  @ManyToOne(() => Provider, prov => prov.transactions)
  @JoinColumn({ name: 'provider_code', referencedColumnName: 'code' })
  provider: Provider; // Relation vers Provider

  @ManyToOne(() => TransactionType, tt => tt.transactions)
  @JoinColumn({ name: 'transaction_type_id', referencedColumnName: 'id' })
  transactionType: TransactionType; // Relation vers TransactionType
}