import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { TenantEntity } from 'src/core/entities/tenant.entity';
import { ClasseCompte, TypeCompte } from '../enums/comptabilite.enums';
import { LigneEcriture } from './ligne-ecriture.entity';

@Entity('comptes_comptables')
export class CompteComptable extends TenantEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 10 })
  numero: string;

  @Column({ length: 255 })
  libelle: string;

  @Column({ type: 'enum', enum: TypeCompte })
  typeCompte: TypeCompte;

  @Column({ type: 'int' })
  classe: ClasseCompte;

  @Column({ default: true })
  actif: boolean;

  @Column({ type: 'text', nullable: true })
  description: string;

  @OneToMany(() => LigneEcriture, l => l.compte)
  lignes: LigneEcriture[];
}
