// district.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { Division } from '../../divivion/entities/divivion.entity';
import { LocationCity } from '../../location_city/entities/location_city.entity';
import { BusinessTable, BusinessColumn } from 'src/core/decorators/business-metadata.decorator';

@Entity('districts')
@BusinessTable({
  label: 'Districts / Arrondissements',
  description: 'Subdivisions administratives des divisions.',
  icon: '🏘️',
  category: 'geographie'
})
export class District {
  @PrimaryGeneratedColumn()
  @BusinessColumn({
    label: 'Identifiant',
    description: 'Identifiant unique du district',
    importance: 'low',
    group: 'technique',
    ignored: true
  })
  id: number;

  @Column({ length: 45, nullable: false })
  @BusinessColumn({
    label: 'Nom',
    description: 'Nom officiel du district',
    example: 'Douala 1er, Dakar Plateau',
    importance: 'high',
    group: 'identification'
  })
  name: string;

  @Column({ length: 45, nullable: false })
  @BusinessColumn({
    label: 'Code',
    description: 'Code unique du district',
    example: 'DLA001, DAK001',
    importance: 'high',
    group: 'identification'
  })
  code: string;

  @Column({ type: 'int', nullable: true })
  @BusinessColumn({
    label: 'Division parente',
    description: 'Identifiant de la division parente',
    importance: 'low',
    group: 'relation',
    ignored: true
  })
  division_id: number;

  @ManyToOne(() => Division, { nullable: true })
  @JoinColumn({ name: 'division_id' })
  @BusinessColumn({
    label: 'Division',
    description: 'Division administrative parente',
    importance: 'high',
    group: 'relation'
  })
  division: Division;

  @OneToMany(
    () => LocationCity,
    location_citie => location_citie.district
  )
  location_cities: LocationCity[];

  @Column({ type: 'varchar', length: 45, nullable: true })
  @BusinessColumn({
    label: 'Population',
    description: 'Population estimée du district',
    unit: 'habitants',
    importance: 'low',
    group: 'statistiques'
  })
  population: string;

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
}