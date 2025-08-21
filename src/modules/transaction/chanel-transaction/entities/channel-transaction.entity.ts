import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  BaseEntity,
  OneToMany,
} from 'typeorm';

import { TransactionSavingsAccount } from '../../transaction_saving_account/entities/transaction_saving_account.entity';



@Entity('channels_transaction')
export class ChannelTransaction extends BaseEntity {
  // Identifiant unique du canal (clé primaire)
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  // Nom du canal (ex : Guichet, Mobile Banking…)
  @Column({ name: 'name', type: 'varchar', length: 45, nullable: true })
  name: string;

  // Code interne du canal (ex : BRANCH, MOBILE…)
  @Column({ name: 'code', type: 'varchar', length: 45, nullable: true })
  code: string;


  @OneToMany(() => TransactionSavingsAccount, (trx) => trx.channelTransaction)
  transactions: TransactionSavingsAccount[];

  // Date de création de l’enregistrement
  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  created_at: Date;

  // Date de dernière mise à jour
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updated_at: Date;
}
