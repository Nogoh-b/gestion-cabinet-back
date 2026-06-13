import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { CompteComptable } from './compte.entity';
import { Ecriture } from './ecriture.entity';

@Entity('lignes_ecriture_comptable')
export class LigneEcriture {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'ecriture_id' })
  ecriture_id: number;

  @ManyToOne(() => Ecriture, e => e.lignes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ecriture_id' })
  ecriture: Ecriture;

  @Column({ name: 'compte_id' })
  compte_id: number;

  @ManyToOne(() => CompteComptable, { eager: true })
  @JoinColumn({ name: 'compte_id' })
  compte: CompteComptable;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  debit: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  credit: number;

  @Column({ length: 500, nullable: true })
  libelle: string;
}
