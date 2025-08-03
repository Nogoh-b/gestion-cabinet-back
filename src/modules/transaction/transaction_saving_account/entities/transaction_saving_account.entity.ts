import { Commercial } from 'src/modules/commercial/entities/commercial.entity';
import { Partner } from 'src/modules/partner/entities/partner.entity';


import { Provider } from 'src/modules/provider/provider/entities/provider.entity';
import { Ressource } from 'src/modules/ressource/ressource/entities/ressource.entity';

import { SavingsAccount } from 'src/modules/savings-account/savings-account/entities/savings-account.entity';
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn, Index, Unique } from 'typeorm';






import { ChannelTransaction } from '../../chanel-transaction/entities/channel-transaction.entity';
import { TransactionType } from '../../transaction_type/entities/transaction_type.entity';








export enum TransactionTypeEnum {
  DEBIT = 0,
  CREDIT = 1,
}
export enum TransactionSavingsAccountStatus {
  PENDING = 0,
  VALIDATE = 1,
  FAILED = 2,
  LOCKED = 3,
}
export enum PaymentStatusProvider {
  PENDING      = 'PENDING',  // transaction initiée, en attente de PIN/OTP
  SUCCESSFULL  = 'SUCCESSFULL',  // paiement confirmé et exécuté
  SUCCESSFUL  = 'SUCCESSFULL',  // paiement confirmé et exécuté
  EXPIRED      = 'EXPIRED',  // délai d’OTP dépassé
  FAILED       = 'FAILED',  // échec de paiement (intégrateurs tiers)
  CANCELED     = 'CANCELED',  // utilisateur a annulé/rejeté
  REJECTED     = 'REJECTED',  // paiement rejeté par le système
  UNKNOWN      = 'UNKNOWN',   // cas imprévu ou non documenté
  ISSUE      = 'ISSUE',   // cas imprévu ou non documenté
  INITIATED      = 'INITIATED'   // cas imprévu ou non documenté
}

export enum PaymentStatus {
  PENDING      = 0,  // transaction initiée, en attente de PIN/OTP
  SUCCESSFULL  = 1,  // paiement confirmé et exécuté
  EXPIRED      = 2,  // délai d’OTP dépassé
  FAILED       = 3,  // échec de paiement (intégrateurs tiers)
  CANCELED     = 4,  // utilisateur a annulé/rejeté
  REJECTED     = 5,  // paiement rejeté par le système
  UNKNOWN      = 6,   // cas imprévu ou non documenté
  ISSUE        = 7,   // cas imprévu ou non documenté
  INITIATED    = 8   // cas imprévu ou non documenté
}

export class PaymentsType {
  id: string;
  name: string;
  code: string;

  constructor(init: Partial<PaymentsType>) {
    Object.assign(this, init);
  }
}
export enum TransactionProvider {
  CASH = 'CASH',
  CHEQUE = 'CHEQUE',
  E_WALLET = 'E_WALLET',
  MOMO = 'MOMO',
  OM = 'OM',
  SAVINGS_ACCOUNT = 'SAVINGS_ACCOUNT',
  SYSTEM = 'SYSTEM',
  WALLET = 'WALLET'
}


export class Payment {
  id: string;
  amount: string;
  paymentStatus: PaymentStatusProvider;
  description: string;
  payToken: string;
  rate: string;
  amountHT: number;
  type: string;
  paymentType: string | null;
  ref: string;
  externalId: string;
  created_at: string;
  updated_at: string;
  paymentsType: PaymentsType;

  constructor(init: Partial<Payment>) {
    Object.assign(this, init);
    if (init.paymentsType) {
      this.paymentsType = new PaymentsType(init.paymentsType);
    }
  }
}

@Entity('transaction_savings_account')
@Unique(['origin', 'promo_code'])
@Unique(['origin', 'commercial_code'])
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
  token: string; 

  @Index()
  @Column({ length: 100 })
  payment_token_provider: string;
  
  @Index()
  @Column({ length: 100 })
  origin: string; 

  @Index()
  @Column({ length: 100 })
  target: string;

  
  @Column({ name: 'status_provider', nullable: true })
  status_provider?: string;
  /*@Index()
  @Column({ length: 100 })
  originType: string;

  @Index()
  @Column({ length: 100 })
  targetType: string;*/


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

  @ManyToOne(() => SavingsAccount, acc => acc.originSavingsAccountTx, {eager: true  })
  @JoinColumn({ name: 'origin_savings_account_id', referencedColumnName: 'id' })
  originSavingsAccount?: SavingsAccount | null;; // Relation vers SavingsAccount

  @ManyToOne(() => Ressource, acc => acc.savings_account, {eager: true  })
  @JoinColumn({ name: 'ressource_id', referencedColumnName: 'id' })
  ressource?: Ressource | null;; // Relation vers SavingsAccount

  @ManyToOne(() => SavingsAccount, acc => acc.targetSavingsAccountTx, {eager: true  })
  @JoinColumn({ name: 'target_savings_account_id', referencedColumnName: 'id' })
  targetSavingsAccount: SavingsAccount | null;; // Relation vers SavingsAccount

  @Column({ type: 'varchar', length: 10, nullable: true }) 
  promo_code: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true }) 
  commission: number | null;

  @Column({type: 'int', nullable: true }) 
  branch_id: number ;

  @Column({ type: 'varchar', length: 10, nullable: true }) 
  commercial_code: string | null;

  @ManyToOne(() => Partner, acc => acc.transactions, {eager: true  })
  @JoinColumn({ name: 'promo_code', referencedColumnName: 'promo_code' })
  partner: Partner | null;; // Relation vers SavingsAccount

  @ManyToOne(() => Commercial, acc => acc.transactions, {eager: true  })
  @JoinColumn({ name: 'commercial_code', referencedColumnName: 'commercial_code' })
  commercial: Partner | null;; // Relation vers SavingsAccount

  /*@ManyToOne(() => Partner, acc => acc.transactions, {eager: true  })
  @JoinColumn({ name: 'partner_id', referencedColumnName: 'promo_code' })
  partner1: Partner | null;; // Relation vers SavingsAccount

  @ManyToOne(() => Commercial, acc => acc.transactions, {eager: true  })
  @JoinColumn({ name: 'comercial_id', referencedColumnName: 'id' })
  comercial: Commercial | null;; // Relation vers SavingsAccount*/

  @ManyToOne(() => ChannelTransaction, ch => ch.transactions, {eager: true})
  @JoinColumn({ name: 'channels_transaction_id', referencedColumnName: 'id' }) 
  channelTransaction: ChannelTransaction; // Relation vers ChannelsTransaction

  @ManyToOne(() => Provider, prov => prov.transactions)
  @JoinColumn({ name: 'provider_code', referencedColumnName: 'code' })
  provider: Provider; // Relation vers Provider

  @ManyToOne(() => TransactionType, tt => tt.transactions, {eager: true})
  @JoinColumn({ name: 'transaction_type_id', referencedColumnName: 'id' })
  transactionType: TransactionType; // Relation vers TransactionType
}