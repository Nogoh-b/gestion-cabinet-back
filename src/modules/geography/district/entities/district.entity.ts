// district.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Division } from '../../divivion/entities/divivion.entity';

@Entity('districts')
export class District {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 45, nullable: false })
  name: string;

  @Column({ length: 45, nullable: false })
  code: string;

  @ManyToOne(() => Division, { nullable: false })
  @JoinColumn({ name: 'division_id' })
  division: Division;

  @Column({ type: 'varchar', length: 45, nullable: true })
  population: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}