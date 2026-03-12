/* eslint-disable prettier/prettier */
import { BaseEntity } from 'src/core/entities/baseEntity';
import { Customer } from 'src/modules/customer/customer/entities/customer.entity';
import { LocationCity } from 'src/modules/geography/location_city/entities/location_city.entity';
import { Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn, Entity, OneToMany } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Employee } from '../../employee/entities/employee.entity';
import { Expose } from 'class-transformer';

@Entity('branch')
export class Branch extends BaseEntity {
  @ApiProperty()
  @PrimaryGeneratedColumn()
  id: number;

  @ApiProperty({ example: 'BR-001' })
  @Column({ length: 10, unique: true })
  code: string;

  @ApiProperty({ example: 'Agence Principale' })
  @Column({ length: 100 })
  name: string;

  @Column()
  location_city_id: number;

  @ManyToOne(() => LocationCity)
  @JoinColumn({ name: 'location_city_id' })
  location_city: LocationCity;

  @ApiProperty({ example: '2023-01-01' })
  @Column({
    type: 'timestamp',
    name: 'creation_date',
    default: () => 'CURRENT_TIMESTAMP',
  })
  creation_date: Date;

  @ApiProperty({ example: 8 })
  @Column({ type: 'int', name: 'opening_hour' })
  opening_hour: number;

  @ApiProperty({ example: 17 })
  @Column({ type: 'int', name: 'closing_hour' })
  closing_hour: number;

  @OneToMany(() => Employee, (employee) => employee.branch)
  employees: Employee[];

  @OneToMany(() => Customer, (c) => c.branch)
  customers: Customer[];

  @ApiProperty({ example: 1 })
  @Column({ type: 'tinyint', default: 1 })
  status: number;

  // =========== GETTERS PERTINENTS ===========

  @Expose()
  get full_address(): string {
    return this.location_city?.full_address || '';
  }

  @Expose()
  get city_name(): string {
    return this.location_city?.name || '';
  }

  @Expose()
  get district_name(): string {
    return this.location_city?.district?.name || '';
  }

  @Expose()
  get region_name(): string {
    return this.location_city?.district?.division?.region?.name || '';
  }

  @Expose()
  get country_name(): string {
    return this.location_city?.district?.division?.region?.country?.name || '';
  }

  @Expose()
  get is_open_now(): boolean {
    const now = new Date();
    const currentHour = now.getHours();
    return currentHour >= this.opening_hour && currentHour < this.closing_hour;
  }

  @Expose()
  get operating_hours_formatted(): string {
    return `${this.opening_hour}:00 - ${this.closing_hour}:00`;
  }

  @Expose()
  get employee_count(): number {
    return this.employees?.length || 0;
  }

  @Expose()
  get active_employee_count(): number {
    return this.employees?.filter(emp => emp.status === 1).length || 0;
  }

  @Expose()
  get customer_count(): number {
    return this.customers?.length || 0;
  }

  @Expose()
  get avocat_count(): number {
    return this.employees?.filter(emp => emp.position === 'avocat').length || 0;
  }

  @Expose()
  get secretaire_count(): number {
    return this.employees?.filter(emp => emp.position === 'secretaire').length || 0;
  }

  @Expose()
  get is_active(): boolean {
    return this.status === 1;
  }

  @Expose()
  get display_name(): string {
    return `${this.code} - ${this.name}`;
  }

  @Expose()
  get location_summary(): string {
    const parts : any[] = [];
    if (this.city_name) parts.push(this.city_name);
    if (this.region_name) parts.push(this.region_name);
    if (this.country_name) parts.push(this.country_name);
    return parts.join(', ') || 'Localisation non définie';
  }

   @Expose()
  get employees_count(): number {
    return this.employees?.length || 0;
  }

  @Expose()
  get active_employees_count(): number {
    return this.employees?.filter(emp => emp.status === 1).length || 0;
  }

  @Expose()
  get avocats_count(): number {
    return this.employees?.filter(emp => emp.position === 'avocat').length || 0;
  }


  @Expose()
  get customers_count(): number {
    return this.customers?.length || 0;
  }


  @Expose()
  get operating_hours(): string {
    return `${this.opening_hour}:00 - ${this.closing_hour}:00`;
  }



  // @Expose()
  // get occupancy_rate(): number {
  //   if (!this.max_capacity) return 0;
  //   return Math.round((this.employee_count / this.max_capacity) * 100);
  // }

  // // =========== MÉTHODES MÉTIER ===========

  // canAcceptMoreEmployees(maxCapacity?: number): boolean {
  //   const capacity = maxCapacity || this.max_capacity;
  //   if (!capacity) return true;
  //   return this.employee_count < capacity;
  // }

  isOpenAt(hour: number): boolean {
    return hour >= this.opening_hour && hour < this.closing_hour;
  }

  getEmployeesByPosition(position: string): Employee[] {
    return this.employees?.filter(emp => emp.position === position) || [];
  }

  // Note: Vous devez ajouter cette colonne si vous voulez utiliser max_capacity
  // @Column({ name: 'max_capacity', type: 'int', nullable: true })
  // max_capacity: number;
}