import { BaseEntity } from 'src/core/entities/baseEntity';
import { GenKeys } from 'src/core/shared/utils/generation-keys.util';
import { Branch } from 'src/modules/agencies/branch/entities/branch.entity';
import { LocationCity } from 'src/modules/geography/location_city/entities/location_city.entity';
import { SavingsAccount } from 'src/modules/savings-account/savings-account/entities/savings-account.entity';

import {
  BeforeInsert,
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { TypeCustomer } from '../../type-customer/entities/type_customer.entity';
import { Loan } from 'src/modules/credit/loan/entities/loan.entity';

export enum CustomerStatus {
  ACTIVE = 1,
  INACTIVE = 0,
  DELETED = -1,
  BLOCKED = -2,
  SUSPENDED = -3,
  LOCKED = -4,
}
export enum CustomerCreatedFrom {
  ONLINE = 1,
  AGENCY = 0,
}
@Entity('customer')
export class Customer extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'last_name', length: 45, nullable: true })
  last_name: string;

  @Column({ name: 'first_name', length: 45, nullable: true })
  first_name: string;

  @Column({ name: 'public_key', length: 45, nullable: true })
  public_key: string;

  @Column({ name: 'private_key', length: 45, nullable: true })
  private_key: string;

  @Column({ name: 'number_phone_1', length: 45, nullable: true })
  number_phone_1: string;

  @Column({ name: 'number_phone_2', length: 45, nullable: true })
  number_phone_2: string;

  @Column({ length: 45, nullable: true, unique: false })
  email: string;

  @Column({ name: 'customer_code', length: 45, nullable: false, unique: true })
  customer_code: string;

  @ManyToOne(() => Branch)
  @JoinColumn({ name: 'branch_id' })
  branch: Branch;

  @OneToMany(() => Loan, (type) => type.customer)
  loans: Loan[];

  @OneToMany(() => SavingsAccount, (sa) => sa.customer)
  savings_accounts: SavingsAccount[];

  @ManyToOne(() => TypeCustomer)
  @JoinColumn({ name: 'type_customer_id' })
  type_customer: TypeCustomer;

  @ManyToOne(() => LocationCity)
  @JoinColumn({ name: 'location_city_id' })
  location_city: LocationCity;

  @Column({ nullable: true, default: CustomerCreatedFrom.AGENCY })
  created_from: CustomerCreatedFrom;

  // Ajoutez ces propriétés pour accéder directement aux IDs
  get typeCustomerId(): number {
    return this.type_customer?.id;
  }

  get locationCityId(): number {
    return this.location_city?.id;
  }

  @Column({ length: 45, nullable: true, unique: false })
  nui: string;

  @Column({ length: 45, nullable: true, unique: false })
  rccm: string;

  @Column({ nullable: true })
  birthday: Date;

  @Column({ nullable: true, default: 1 })
  status: CustomerStatus;

  @BeforeInsert()
  generateKeys() {
    const { publicKey, privateKey } = GenKeys.generateKeyPair();
    const encryptedPrivateKey = GenKeys.encryptPrivateKey(privateKey);
    this.public_key = 'publicKey';
    this.private_key = 'encryptedPrivateKey';
  }
}
