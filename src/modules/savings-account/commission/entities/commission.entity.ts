import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';



import { CommissionValueType } from '../dto/create-commission.dto';




@Entity('commission')
export class Commission {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 100 })
  description: string;

  @Column({
    type: 'tinyint',
    name: 'value_type',
    default: CommissionValueType.FIXED,
  })
  value_type: CommissionValueType;

  @Column({ type: 'int', nullable: true, name: 'amount' })
  amount: number | null;
}
