import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { TenantEntity } from 'src/core/entities/tenant.entity';
import { StatutExercice } from '../enums/comptabilite.enums';
import { Ecriture } from './ecriture.entity';

@Entity('exercices_comptables')
export class ExerciceComptable extends TenantEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  annee: number;

  @Column({ name: 'date_debut', type: 'date' })
  dateDebut: Date;

  @Column({ name: 'date_fin', type: 'date' })
  dateFin: Date;

  @Column({ type: 'enum', enum: StatutExercice, default: StatutExercice.OUVERT })
  statut: StatutExercice;

  @Column({ name: 'date_cloture', type: 'date', nullable: true })
  dateCloture: Date;

  @OneToMany(() => Ecriture, e => e.exercice)
  ecritures: Ecriture[];
}
