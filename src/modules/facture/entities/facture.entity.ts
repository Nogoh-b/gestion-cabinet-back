// src/facture/entities/facture.entity.ts
import { Customer } from 'src/modules/customer/customer/entities/customer.entity';



import { Dossier } from 'src/modules/dossiers/entities/dossier.entity';
import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    OneToMany,
    ManyToOne,
    JoinColumn
} from 'typeorm';



import { Paiement } from '../../paiement/entities/paiement.entity';
import { StatutFacture, TypeFacture } from '../dto/create-facture.dto';







@Entity('factures')
export class Facture {
  @PrimaryGeneratedColumn('uuid')
  id: number;

  @Column({ name: 'dossier_id' })
  dossier_id: number;

  @Column({ name: 'client_id' })
  client_id: number;

  @Column({
    type: 'enum',
    enum: TypeFacture,
    default: TypeFacture.HONORAIRES
  })
  type: TypeFacture;

  @Column({ unique: true })
  numero: string;

  @Column({ name: 'date_facture', type: 'date' })
  dateFacture: Date;

  @Column({ name: 'date_echeance', type: 'date' })
  dateEcheance: Date;

  @Column({ name: 'montant_ht', type: 'decimal', precision: 10, scale: 2 })
  montantHT: number;

  @Column({ name: 'taux_tva', type: 'decimal', precision: 5, scale: 2 })
  tauxTVA: number;

  @Column({ name: 'montant_tva', type: 'decimal', precision: 10, scale: 2 })
  montantTVA: number;

  @Column({ name: 'montant_ttc', type: 'decimal', precision: 10, scale: 2 })
  montantTTC: number;

  @Column({ name: 'montant_paye', type: 'decimal', precision: 10, scale: 2, default: 0 })
  montantPaye: number;

  @Column({ name: 'reste_a_payer', type: 'decimal', precision: 10, scale: 2 })
  resteAPayer: number;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({
    type: 'enum',
    enum: StatutFacture,
    default: StatutFacture.BROUILLON
  })
  status: StatutFacture;

  @Column({ name: 'notes_internes', type: 'text', nullable: true })
  notesInternes: string;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;

  // Relations
  @OneToMany(() => Paiement, paiement => paiement.facture)
  paiements: Paiement[];

  @ManyToOne(() => Dossier, { nullable: true })
  @JoinColumn({ name: 'dossier_id' })
  dossier: Dossier;

  @ManyToOne(() => Customer, { nullable: true })
  @JoinColumn({ name: 'clientId' })
  client: Customer;

  // Méthodes utilitaires
  calculerResteAPayer(): void {
    this.resteAPayer = this.montantTTC - this.montantPaye;
    this.mettreAJourStatut();
  }

  ajouterPaiement(montant: number): void {
    this.montantPaye += montant;
    this.calculerResteAPayer();
  }

  private mettreAJourStatut(): void {
    if (this.montantPaye === 0) {
      this.status = StatutFacture.ENVOYEE;
    } else if (this.montantPaye > 0 && this.montantPaye < this.montantTTC) {
      this.status = StatutFacture.PARTIELLEMENT_PAYEE;
    } else if (this.montantPaye >= this.montantTTC) {
      this.status = StatutFacture.PAYEE;
    }
  }
}