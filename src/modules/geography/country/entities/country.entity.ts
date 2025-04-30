// country.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

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

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}