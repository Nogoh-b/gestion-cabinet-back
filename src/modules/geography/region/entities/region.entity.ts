// region.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { Country } from '../../country/entities/country.entity';
import { Division } from '../../divivion/entities/divivion.entity';

@Entity('region')
export class Region {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 45, nullable: true })
  name: string;

  @Column({ length: 45, nullable: true })
  code: string;

  @Column({ type: 'int', nullable: true })
  country_id: number;

  @ManyToOne(() => Country, { nullable: true})
  @JoinColumn({ name: 'country_id' })
  country: Country;

  @Column({ type: 'varchar', length: 45, nullable: true })
  population: string;

  @OneToMany(() => Division, (division) => division.region)
  divisions: Division[];

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
}