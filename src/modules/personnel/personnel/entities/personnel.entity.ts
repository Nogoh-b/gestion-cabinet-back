import { BaseEntity } from 'src/core/entities/base.entity';
import { Customer } from 'src/modules/customer/customer/entities/customer.entity';
import { SavingsAccount } from 'src/modules/savings-account/savings-account/entities/savings-account.entity';
import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';



import { ApiProperty } from '@nestjs/swagger';







import { TypePersonnel } from '../../type_personnel/entities/type_personnel.entity';











@Entity('personnel')
export class Personnel extends BaseEntity {
  @PrimaryGeneratedColumn()
  @ApiProperty()
  id: number;

  @ManyToOne(() => TypePersonnel, type => type.personnels, { eager: true })
  @JoinColumn({ name: 'type_personnel_id' })
  @ApiProperty({ type: () => TypePersonnel })
  type_personnel: TypePersonnel;

  @ManyToOne(() => Customer, { eager: true })
  @JoinColumn({ name: 'customer_id' })
  @ApiProperty({ type: () => Customer })
  customer: Customer;

@ManyToOne(() => SavingsAccount)
  @JoinColumn({ name: 'savings_account_id' })
  @ApiProperty({ type: () => SavingsAccount })
  savings_account: SavingsAccount;

  
  @Column({ length: 20,  nullable: true })
  name: string ;
  
  @Column({ length: 20, unique: true, nullable: true })
  code: string;
}