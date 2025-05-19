import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';
import { CommissionValueType } from '../dto/create-commission.dto';

@Entity('commission')
export class Commission {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 100 })
  description: string;

  @Column({ type: 'enum', enum: CommissionValueType, name: 'value_type' })
  value_type: CommissionValueType;

  @Column({ type: 'int', nullable: true, name: 'amount' })
  amount: number | null;
}
