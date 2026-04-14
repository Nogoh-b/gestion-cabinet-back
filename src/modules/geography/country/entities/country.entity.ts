// country.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';

import { Region } from '../../region/entities/region.entity';


@Entity('country')
export class Country {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 45, nullable: false })
  name: string;

  @Column({ length: 45, nullable: false })
  code: string;

  @Column({ type: 'varchar', length: 45, nullable: true })
  population: string;



  @OneToMany(
    () => Region,
    region => region.country
  )
  regions: Region[];

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
}