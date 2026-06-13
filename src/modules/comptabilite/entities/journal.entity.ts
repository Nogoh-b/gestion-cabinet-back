import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { TenantEntity } from 'src/core/entities/tenant.entity';
import { TypeJournal } from '../enums/comptabilite.enums';
import { Ecriture } from './ecriture.entity';

@Entity('journaux_comptables')
export class JournalComptable extends TenantEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 10 })
  code: string;

  @Column({ length: 255 })
  libelle: string;

  @Column({ type: 'enum', enum: TypeJournal })
  typeJournal: TypeJournal;

  @Column({ default: true })
  actif: boolean;

  @OneToMany(() => Ecriture, e => e.journal)
  ecritures: Ecriture[];
}
