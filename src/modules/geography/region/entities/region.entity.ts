// region.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { Country } from '../../country/entities/country.entity';
import { Division } from '../../divivion/entities/divivion.entity';
import { BusinessTable, BusinessColumn } from 'src/core/decorators/business-metadata.decorator';

@Entity('region')
@BusinessTable({
  label: 'Régions',
  description: 'Régions administratives des pays.',
  icon: '🗺️',
  category: 'geographie'
})
export class Region {
  @PrimaryGeneratedColumn()
  @BusinessColumn({
    label: 'Identifiant',
    description: 'Identifiant unique de la région',
    importance: 'low',
    group: 'technique',
    ignored: true
  })
  id: number;

  @Column({ length: 45, nullable: true })
  @BusinessColumn({
    label: 'Nom',
    description: 'Nom officiel de la région',
    example: 'Île-de-France, Littoral, Centre',
    importance: 'high',
    group: 'identification'
  })
  name: string;

  @Column({ length: 45, nullable: true })
  @BusinessColumn({
    label: 'Code',
    description: 'Code unique de la région',
    example: 'IDF, LT, CE',
    importance: 'high',
    group: 'identification'
  })
  code: string;

  @Column({ type: 'int', nullable: true })
  @BusinessColumn({
    label: 'Pays parent',
    description: 'Identifiant du pays parent',
    importance: 'low',
    group: 'relation',
    ignored: true
  })
  country_id: number;

  @ManyToOne(() => Country, { nullable: true })
  @JoinColumn({ name: 'country_id' })
  @BusinessColumn({
    label: 'Pays',
    description: 'Pays auquel appartient la région',
    importance: 'high',
    group: 'relation'
  })
  country: Country;

  @Column({ type: 'varchar', length: 45, nullable: true })
  @BusinessColumn({
    label: 'Population',
    description: 'Population estimée de la région',
    unit: 'habitants',
    importance: 'low',
    group: 'statistiques'
  })
  population: string;

  @OneToMany(() => Division, (division) => division.region)
  divisions: Division[];

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