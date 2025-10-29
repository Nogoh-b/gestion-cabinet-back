// division.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { Region } from '../../region/entities/region.entity';
import { District } from '../../district/entities/district.entity';

@Entity('division')
export class Division {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 45, nullable: true })
  name: string;

  @Column({ length: 45, nullable: true })
  code: string;

  @Column({ type: 'int', nullable: true })
  region_id: number;

  @ManyToOne(() => Region, { nullable: true, eager: true  })
  @JoinColumn({ name: 'region_id' })
  region: Region;

    @OneToMany(
        () => District,
        district => district.division
      )
      districts: District[];

  @Column({ type: 'varchar', length: 45, nullable: true })
  population: string;

  @CreateDateColumn({ name: 'created_at' })
  create_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  update_at: Date;

  @Column({ type: 'tinyint', nullable: true })
  status: number;
}