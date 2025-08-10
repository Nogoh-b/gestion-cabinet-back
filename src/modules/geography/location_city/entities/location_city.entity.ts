// location-city.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

import { District } from '../../district/entities/district.entity';


@Entity('location_city')
export class LocationCity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 45, nullable: true })
  name: string;

  @Column({ length: 45, nullable: true })
  code: string;

  @Column({ type: 'bigint', nullable: true })
  population: string;

  @ManyToOne(() => District, { nullable: false , eager: true })
  @JoinColumn({ name: 'districts_id' })
  district: District;

  @CreateDateColumn({ name: 'created_at' })
  create_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  update_at: Date;
}