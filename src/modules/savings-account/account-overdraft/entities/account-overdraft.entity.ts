import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { SavingsAccount } from '../../savings-account/entities/savings-account.entity';

@Entity('account_overdraft')
export class AccountOverdraft {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  account_id: number;
  @ManyToOne(() => SavingsAccount, (acc) => acc.account_overdraft, {
    eager: true,
  })
  @JoinColumn({ name: 'account_id', referencedColumnName: 'id' })
  savingsAccount: SavingsAccount | null; // Relation vers SavingsAccount 
  @Column({ type: 'decimal', precision: 18, scale: 2 })
  overdraft_limit: number; // exemple : -100000

  @CreateDateColumn()
  created_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  valid_to: Date;

  @Column({ type: 'varchar', nullable: true })
  reason: string;
}
