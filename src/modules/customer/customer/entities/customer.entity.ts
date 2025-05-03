import { LocationCity } from 'src/modules/geography/location_city/entities/location_city.entity';
import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { TypeCustomer } from '../../type-customer/entities/type_customer.entity';
import { BaseEntity } from 'src/core/entities/base.entity';

@Entity('customer')
export class Customer extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 45, nullable: true })
  name: string;

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

  @Column({ length: 45, nullable: true, unique: true })
  email: string;

  /*@ManyToOne(() => District, { nullable: false })
  @JoinColumn({ name: 'districts_id' })
  district: District;*/

  @ManyToOne(() => TypeCustomer)
  @JoinColumn({ name: 'type_customer_id' })
  type_customer: TypeCustomer;

  @ManyToOne(() => LocationCity)
  @JoinColumn({ name: 'location_city_id' })
  location_city: LocationCity;

  // Ajoutez ces propriétés pour accéder directement aux IDs
  get typeCustomerId(): number {
    return this.type_customer?.id;
  }

  get locationCityId(): number {
    return this.location_city?.id;
  }

  @Column({ length: 45, nullable: true, unique: true })
  nui: string;

  @Column({ length: 45, nullable: true, unique: true })
  rccm: string;

  @Column({ nullable: true })
  birthday: Date;

  @Column({ nullable: true, default: 1 })
  status: number;
}