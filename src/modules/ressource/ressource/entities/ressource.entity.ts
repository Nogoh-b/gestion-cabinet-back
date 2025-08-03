import { SavingsAccount } from 'src/modules/savings-account/savings-account/entities/savings-account.entity';
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';


import { ApiProperty } from '@nestjs/swagger';


import { RessourceType } from '../../ressource-type/entities/ressource-type.entity';







@Entity()
export class Ressource {
  @PrimaryGeneratedColumn()
  @ApiProperty()
  id: number;

  @Column()
  @ApiProperty({ example: 1 })
  ressource_type_id: number;

  @Column()
  @ApiProperty({ example: 5 })
  savings_account_id: number;

  @ManyToOne(() => RessourceType)
  @JoinColumn({ name: 'ressource_type_id' })
  ressource_type: RessourceType;

  @ManyToOne(() => SavingsAccount)
  @JoinColumn({ name: 'savings_account_id' })
  savings_account: SavingsAccount;

  @Column({ default: 1 })
  @ApiProperty({ example: 1 })
  status: number;

  @Column()
  code: string;

  @Column({ nullable: true })
  swift_code: string;

  @Column({ nullable: true })
  bank_code: string;

  @Column({ nullable: true })
  account_number: string;

  @Column({ nullable: true })
  key: string;

  @Column({ nullable: true })
  iban: string;

  @Column({ nullable: true })
  account_label: string;

  @CreateDateColumn()
  @ApiProperty()
  created_at: Date;
} 