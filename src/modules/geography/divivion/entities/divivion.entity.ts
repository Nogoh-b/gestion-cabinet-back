// division.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { Region } from '../../region/entities/region.entity';
import { District } from '../../district/entities/district.entity';
import { BusinessTable, BusinessColumn } from 'src/core/decorators/business-metadata.decorator';

@Entity('division')
@BusinessTable({
  label: 'Divisions',
  description: 'Subdivisions administratives des régions.',
  icon: '🗺️',
  category: 'geographie'
})
export class Division {
  @PrimaryGeneratedColumn()
  @BusinessColumn({
    label: 'Identifiant',
    description: 'Identifiant unique de la division',
    importance: 'low',
    group: 'technique',
    ignored: true
  })
  id: number;

  @Column({ length: 45, nullable: true })
  @BusinessColumn({
    label: 'Nom',
    description: 'Nom officiel de la division',
    example: 'Littoral, Centre, Ouest',
    importance: 'high',
    group: 'identification'
  })
  name: string;

  @Column({ length: 45, nullable: true })
  @BusinessColumn({
    label: 'Code',
    description: 'Code unique de la division',
    example: 'LT, CE, OU',
    importance: 'high',
    group: 'identification'
  })
  code: string;

  @Column({ type: 'int', nullable: true })
  @BusinessColumn({
    label: 'Région parente',
    description: 'Identifiant de la région parente',
    importance: 'low',
    group: 'relation',
    ignored: true
  })
  region_id: number;

  @ManyToOne(() => Region, { nullable: true })
  @JoinColumn({ name: 'region_id' })
  @BusinessColumn({
    label: 'Région',
    description: 'Région administrative parente',
    importance: 'high',
    group: 'relation'
  })
  region: Region;

  @OneToMany(
    () => District,
    district => district.division
  )
  districts: District[];

  @Column({ type: 'varchar', length: 45, nullable: true })
  @BusinessColumn({
    label: 'Population',
    description: 'Population estimée de la division',
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

  @Column({ type: 'tinyint', nullable: true })
  @BusinessColumn({
    label: 'Statut',
    description: 'BD: 1=Actif, 0=Inactif. En SQL utiliser le nombre.',
    importance: 'medium',
    group: 'état'
  })
  status: number;
}
