import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';


@Entity('otp_codes')
export class OtpCode {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  email: string;

  @Column()
  code: string;

  @Column({ type: 'timestamp' })
  expiresAt: Date;

  @Column({ default: false })
  used: boolean;

  @Column({ type: 'int', comment: '0 = Dépôt, 1 = Retrait' })
  transactionType: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  @Column({ type: 'varchar', length: 10, comment: 'MOMO ou OM' })
  provider: string;

  @Column({ type: 'varchar', length: 50, comment: 'Code du compte épargne concerné' })
  savingsAccountCode: string;

  @Column({ type: 'varchar', length: 50, nullable : true, comment: 'Code du compte épargne concerné' })
  targetSavingsAccountCode: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}




@Entity('otp_online_link')
export class OtpOnlineLink {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  email: string;

  @Column()
  code: string;

  @Column({ type: 'timestamp' })
  expiresAt: Date;

  @Column({ default: false })
  used: boolean;

  @Column({ type: 'varchar', length: 50, comment: 'Code du compte épargne concerné' })
  savingsAccountCode: string;

  @Column({ type: 'varchar', length: 50, nullable:true, comment: 'Identifiant unique dans le système COTI' })
  cotiCustomerCode: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
