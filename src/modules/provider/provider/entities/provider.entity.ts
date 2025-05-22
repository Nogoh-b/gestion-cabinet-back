import { Country } from 'src/modules/geography/country/entities/country.entity';
import { Entity, Column, PrimaryColumn, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';

@Entity('provider')
export class Provider {
  @PrimaryColumn({ length: 45 })
  code: string;

  @Column({ length: 100 })
  name: string;

  @Column({ type: 'tinyint', nullable: true })
  status?: number;

  @Column({ length: 255, nullable: true })
  api_endpoint?: string;

  @ManyToOne(() => Country, { nullable: true })
  @JoinColumn({ name: 'country_id', referencedColumnName: 'id' })
  country?: Country;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}