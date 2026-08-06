import {
  Column,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { TenantEntity } from 'src/core/entities/tenant.entity';
import { StatutExercice } from '../enums/comptabilite.enums';
import { Ecriture } from './ecriture.entity';
import { BusinessTable, BusinessColumn } from 'src/core/decorators/business-metadata.decorator';

@Entity('exercices_comptables')
@Index('UQ_exercises_tenant_year', ['tenant_id', 'annee'], {
  unique: true,
})
@BusinessTable({
  label: 'Exercices comptables',
  description: 'Exercices (années) comptables du cabinet. Un exercice est ouvert ou clôturé ; aucune écriture manuelle ne peut être ajoutée à un exercice clôturé.',
  icon: '📅',
  category: 'finance',
})
export class ExerciceComptable extends TenantEntity {
  @PrimaryGeneratedColumn()
  @BusinessColumn({
    label: 'Identifiant',
    description: 'Identifiant unique de l\'exercice',
    importance: 'low',
    group: 'technique',
    ignored: true,
  })
  id: number;

  @Column()
  @BusinessColumn({
    label: 'Année',
    description: 'Année de l\'exercice comptable',
    example: '2026',
    importance: 'critical',
    group: 'identification',
  })
  annee: number;

  @Column({ name: 'date_debut', type: 'date' })
  @BusinessColumn({
    label: 'Date de début',
    description: 'Date de début de l\'exercice',
    format: 'date',
    importance: 'high',
    group: 'dates',
  })
  dateDebut: Date;

  @Column({ name: 'date_fin', type: 'date' })
  @BusinessColumn({
    label: 'Date de fin',
    description: 'Date de fin de l\'exercice',
    format: 'date',
    importance: 'high',
    group: 'dates',
  })
  dateFin: Date;

  @Column({ type: 'enum', enum: StatutExercice, default: StatutExercice.OUVERT })
  @BusinessColumn({
    label: 'Statut',
    description: "BD: 'OUVERT' ou 'CLOTURE'.",
    importance: 'critical',
    group: 'état',
  })
  statut: StatutExercice;

  @Column({
    name: 'date_cloture',
    type: 'datetime',
    precision: 6,
    nullable: true,
  })
  @BusinessColumn({
    label: 'Date de clôture',
    description: 'Date à laquelle l\'exercice a été clôturé',
    format: 'date',
    importance: 'medium',
    group: 'dates',
  })
  dateCloture: Date | null;

  @Column({ name: 'closing_report', type: 'text', nullable: true })
  closingReport: string | null;

  @Column({
    name: 'reconciliation_reference',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  reconciliationReference: string | null;

  @Column({
    name: 'closed_by',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  closedBy: string | null;

  @OneToMany(() => Ecriture, e => e.exercice)
  ecritures: Ecriture[];
}
