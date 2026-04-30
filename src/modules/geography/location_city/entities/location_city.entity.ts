// location-city.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { District } from '../../district/entities/district.entity';
import { Expose } from 'class-transformer';
import { BusinessTable, BusinessColumn } from 'src/core/decorators/business-metadata.decorator';

@Entity('location_city')
@BusinessTable({
  label: 'Villes',
  description: 'Villes et communes.',
  icon: '🏙️',
  category: 'geographie'
})
export class LocationCity {
  @PrimaryGeneratedColumn()
  @BusinessColumn({
    label: 'Identifiant',
    description: 'Identifiant unique de la ville',
    importance: 'low',
    group: 'technique',
    ignored: true
  })
  id: number;

  @Column({ length: 45, nullable: true })
  @BusinessColumn({
    label: 'Nom',
    description: 'Nom officiel de la ville',
    example: 'Douala, Yaoundé, Dakar',
    importance: 'critical',
    group: 'identification'
  })
  name: string;

  @Column({ length: 45, nullable: true })
  @BusinessColumn({
    label: 'Code',
    description: 'Code postal ou code unique de la ville',
    example: '00237, 00221, 75001',
    importance: 'medium',
    group: 'identification'
  })
  code: string;

  @Column({ type: 'bigint', nullable: true })
  @BusinessColumn({
    label: 'Population',
    description: 'Population estimée de la ville',
    unit: 'habitants',
    importance: 'low',
    group: 'statistiques'
  })
  population: string;

  @Column({ type: 'int', nullable: true })
  @BusinessColumn({
    label: 'District parent',
    description: 'Identifiant du district parent',
    importance: 'low',
    group: 'relation',
    ignored: true
  })
  districts_id: number;

  @ManyToOne(() => District, { nullable: true })
  @JoinColumn({ name: 'districts_id' })
  @BusinessColumn({
    label: 'District',
    description: 'District auquel appartient la ville',
    importance: 'high',
    group: 'relation'
  })
  district: District;

  @CreateDateColumn({ name: 'created_at' })
  @BusinessColumn({
    label: 'Date de création',
    description: 'Date de création dans le système',
    format: 'date',
    importance: 'low',
    group: 'audit',
    ignored: true
  })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  @BusinessColumn({
    label: 'Date de modification',
    description: 'Date de dernière modification',
    format: 'date',
    importance: 'low',
    group: 'audit',
    ignored: true
  })
  updated_at: Date;

  @Expose()
  get full_address(): string {
    const district = this.district?.name ?? '';
    const division = this.district?.division?.name ?? '';
    const region = this.district?.division?.region?.name ?? '';
    const country = this.district?.division?.region?.country?.name ?? '';
    return [this.name, district, division, region, country].filter(Boolean).join(', ');
  }
}