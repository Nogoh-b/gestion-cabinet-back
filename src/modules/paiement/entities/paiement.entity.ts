// src/paiement/entities/paiement.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  DeleteDateColumn
} from 'typeorm';

import { Facture } from '../../facture/entities/facture.entity';
import { ModePaiement, StatutPaiement } from '../dto/create-paiement.dto';


@Entity('paiements')
export class Paiement {
  @PrimaryGeneratedColumn('uuid')
  id: number;

  @Column({ name: 'facture_id' })
  factureId: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  montant: number;
 
  @Column({
    type: 'enum',
    enum: ModePaiement,
    default : ModePaiement.ESPECES
  })
  modePaiement: ModePaiement;

  @Column({ name: 'date_paiement', type: 'date' })
  datePaiement: Date;

  @Column({ name: 'date_valeur', type: 'date' })
  dateValeur: Date;

  @Column({ nullable: true })
  reference: string;

  @Column({ name: 'numero_cheque', nullable: true })
  numeroCheque: string;

  @Column({ nullable: true })
  banque: string;
 
  @Column({ nullable: true })
  titulaire: string;

  @Column({
    type: 'enum',
    enum: StatutPaiement
    
  })
  status: StatutPaiement;


  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ name: 'preuve_paiement', nullable: true })
  preuvePaiement: string;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;

  // Relations
  @ManyToOne(() => Facture, facture => facture.paiements)
  @JoinColumn({ name: 'facture_id' })
  facture: Facture;

  @DeleteDateColumn()
  deletedAt: Date;
  
}