import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, JoinColumn, OneToOne } from 'typeorm';
import { TransactionSavingsAccount } from '../../transaction_saving_account/entities/transaction_saving_account.entity';

export enum DisputeStatus {
  OPEN = 0,
  IN_REVIEW = 3,
  RESOLVED = 1,
  REJECTED = 2,
  ESCALATED = 4
}

export enum DisputeSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

@Entity('transaction_disputes')
export class TransactionDispute {
  @PrimaryGeneratedColumn()
  id: number;

  @OneToOne(() => TransactionSavingsAccount)
  @JoinColumn({ name: 'transaction_id' })
  transaction: TransactionSavingsAccount;

  @Column({ type: 'int' })
  transaction_id: number;

  @Column({
    type: 'enum',
    enum: DisputeStatus,
    default: DisputeStatus.OPEN
  })
  status: DisputeStatus;

  @Column({
    type: 'enum',
    enum: DisputeSeverity,
    default: DisputeSeverity.MEDIUM
  })
  severity: DisputeSeverity;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'text', nullable: true })
  resolution_notes: string;


  @Column({ type: 'int', nullable: true })
  assigned_to_id: number | null;

  @Column({ type: 'timestamp', nullable: true })
  resolution_date: Date | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  closed_at: Date | null;
}