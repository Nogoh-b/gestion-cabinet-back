import { BaseEntity } from 'src/core/entities/base.entity';
import { LocationCity } from 'src/modules/geography/location_city/entities/location_city.entity';
import { Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn, Entity, OneToMany } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

import { Employee } from '../../employee/entities/employee.entity';


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


  @ApiProperty({ example: 1 })
  @Column({ type: 'tinyint', default: 1 })
  status: number;
}