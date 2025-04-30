import { District } from 'src/modules/geography/district/entities/district.entity';
import { LocationCity } from 'src/modules/geography/location_city/entities/location_city.entity';
import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { TypeCustomer } from '../../type-customer/entities/type_customer.entity';

@Entity('customer')
export class Customer {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 45, nullable: true })
  name: string;

  @Column({ name: 'first_name', length: 45, nullable: true })
  firstName: string;

  @Column({ name: 'public_key', length: 45, nullable: true })
  publicKey: string;

  @Column({ name: 'private_key', length: 45, nullable: true })
  privateKey: string;

  @Column({ name: 'number_phone_1', length: 45, nullable: true })
  numberPhone1: string;

  @Column({ name: 'number_phone_2', length: 45, nullable: true })
  numberPhone2: string;

  @Column({ length: 45, nullable: true, unique: true })
  email: string;

  @ManyToOne(() => District, { nullable: false })
  @JoinColumn({ name: 'districts_id' })
  district: District;

 @ManyToOne(() => TypeCustomer)
  @JoinColumn({ name: 'type_customer_id' })
  typeCustomer: TypeCustomer;

  @ManyToOne(() => LocationCity)
  @JoinColumn({ name: 'location_city_id' })
  locationCity: LocationCity;

  // Ajoutez ces propriétés pour accéder directement aux IDs
  get typeCustomerId(): number {
    return this.typeCustomer?.id;
  }

  get locationCityId(): number {
    return this.locationCity?.id;
  }

  @Column({ length: 45, nullable: true, unique: true })
  nui: string;

  @Column({ length: 45, nullable: true, unique: true })
  rccm: string;

  @Column({ nullable: true })
  birthday: Date;

  @Column({ nullable: true })
  status: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}