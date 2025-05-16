import { BaseEntity } from 'src/core/entities/base.entity';
import { Entity, Column, ManyToOne, Index } from 'typeorm';
import { SavingsAccount } from '../../savings-account/entities/savings-account.entity';

@Entity('document_saving_account')
@Index('unique', ['type'], { unique: true })
export class DocumentSavingAccount extends BaseEntity {
  @Column({ primary: true, generated: true })
  id: number;

  @Column({ length: 45 })
  name: string;

  @Column({ length: 45 })
  type: string;

  @Column({ default: 0 })
  status: number;

  @Column({ type: 'timestamp', nullable: true })
  date_validation: Date;

  @Column({ type: 'timestamp', nullable: true })
  date_ejected: Date;

  @Column({ type: 'timestamp', nullable: true })
  date_expired: Date;

  @ManyToOne(() => SavingsAccount, { cascade: true })
  savings_account: SavingsAccount;
}