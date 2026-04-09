// district.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { Division } from '../../divivion/entities/divivion.entity';
import { LocationCity } from '../../location_city/entities/location_city.entity';

@Entity('districts')
export class District {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 45, nullable: false })
  name: string;

  @Column({ length: 45, nullable: false })
  code: string;

  @Column({ type: 'int', nullable: true })
  division_id: number;

  @ManyToOne(() => Division, { nullable: true, eager: true  })
  @JoinColumn({ name: 'division_id' })
  division: Division;

  
  @OneToMany(
      () => LocationCity,
      location_citie => location_citie.district
    )
    location_cities: LocationCity[];

  @Column({ type: 'varchar', length: 45, nullable: true })
  population: string;

  @CreateDateColumn({ name: 'created_at' })
  create_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  update_at: Date;
}