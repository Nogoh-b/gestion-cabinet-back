// country.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { Region } from '../../region/entities/region.entity';
import { BusinessTable, BusinessColumn } from 'src/core/decorators/business-metadata.decorator';

@Entity('country')
@BusinessTable({
  label: 'Pays',
  description: 'Liste des pays où le cabinet intervient. Un pays peut contenir plusieurs régions.',
  icon: '🌍',
  category: 'geographie'
})
export class Country {
  @PrimaryGeneratedColumn()
  @BusinessColumn({
    label: 'Identifiant',
    description: 'Identifiant unique du pays',
    importance: 'low',
    group: 'technique',
    ignored: true
  })
  id: number;

  @Column({ length: 45, nullable: false })
  @BusinessColumn({
    label: 'Nom du pays',
    description: 'Nom officiel du pays',
    example: 'France, Cameroun, Belgique, Suisse',
    importance: 'critical',
    group: 'identification'
  })
  name: string;

  @Column({ length: 45, nullable: false })
  @BusinessColumn({
    label: 'Code pays',
    description: 'Code ISO à deux ou trois lettres du pays',
    example: 'FR, CM, BE, CH',
    importance: 'high',
    group: 'identification'
  })
  code: string;

  @Column({ type: 'varchar', length: 45, nullable: true })
  @BusinessColumn({
    label: 'Population',
    description: 'Population estimée du pays',
    unit: 'habitants',
    example: '67 000 000, 25 000 000',
    importance: 'low',
    group: 'statistiques'
  })
  population: string;

  @OneToMany(
    () => Region,
    region => region.country
  )
  @BusinessColumn({
    label: 'Régions',
    description: 'Liste des régions administratives du pays',
    importance: 'medium',
    group: 'relation'
  })
  regions: Region[];

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

  // ==================== GETTERS MÉTIER ====================

  @BusinessColumn({
    label: 'Nom complet',
    description: 'Code et nom combinés pour l\'affichage',
    example: 'FR - France',
    importance: 'medium',
    group: 'identification'
  })
  get display_name(): string {
    return `${this.code} - ${this.name}`;
  }

  @BusinessColumn({
    label: 'Nombre de régions',
    description: 'Nombre total de régions dans ce pays',
    importance: 'medium',
    group: 'statistiques'
  })
  get regions_count(): number {
    return this.regions?.length || 0;
  }
}