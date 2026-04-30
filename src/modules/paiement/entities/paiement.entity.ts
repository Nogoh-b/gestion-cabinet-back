// paiement.entity.ts
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
import { BusinessTable, BusinessColumn } from 'src/core/decorators/business-metadata.decorator';

@Entity('paiements')
@BusinessTable({
  label: 'Paiements',
  description: 'Enregistrement des paiements reçus des clients pour les factures.',
  icon: '💳',
  category: 'finance'
})
export class Paiement {
  @PrimaryGeneratedColumn('uuid')
  @BusinessColumn({
    label: 'Identifiant',
    description: 'Identifiant unique du paiement',
    importance: 'low',
    group: 'technique',
    ignored: true
  })
  id: number;

  @Column({ name: 'facture_id' })
  @BusinessColumn({
    label: 'Facture',
    description: 'Identifiant de la facture associée',
    importance: 'critical',
    group: 'relation',
    ignored: true
  })
  factureId: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  @BusinessColumn({
    label: 'Montant',
    description: 'Montant payé',
    unit: '€',
    format: 'currency',
    importance: 'critical',
    group: 'financier'
  })
  montant: number;

  @Column({
    type: 'enum',
    enum: ModePaiement,
    default: ModePaiement.ESPECES
  })
  @BusinessColumn({
    label: 'Mode de paiement',
    description: 'ESPECES, CHEQUE, VIREMENT, CARTE_BANCAIRE, PRELEVEMENT, MOBILE_MONEY',
    example: 'VIREMENT, CHEQUE, MOBILE_MONEY',
    importance: 'high',
    group: 'paiement'
  })
  modePaiement: ModePaiement;

  @Column({ name: 'date_paiement', type: 'date' })
  @BusinessColumn({
    label: 'Date de paiement',
    description: 'Date à laquelle le paiement a été effectué',
    format: 'date',
    importance: 'high',
    group: 'dates'
  })
  datePaiement: Date;

  @Column({ name: 'date_valeur', type: 'date' })
  @BusinessColumn({
    label: 'Date de valeur',
    description: 'Date de valeur bancaire',
    format: 'date',
    importance: 'medium',
    group: 'dates'
  })
  dateValeur: Date;

  @Column({ nullable: true })
  @BusinessColumn({
    label: 'Référence',
    description: 'Référence du paiement (numéro de transaction, virement, etc.)',
    importance: 'medium',
    group: 'identification'
  })
  reference: string;

  @Column({ name: 'numero_cheque', nullable: true })
  @BusinessColumn({
    label: 'Numéro de chèque',
    description: 'Numéro du chèque (si paiement par chèque)',
    importance: 'medium',
    group: 'identification'
  })
  numeroCheque: string;

  @Column({ nullable: true })
  @BusinessColumn({
    label: 'Banque',
    description: 'Banque émettrice (chèque ou virement)',
    importance: 'medium',
    group: 'coordonnées'
  })
  banque: string;

  @Column({ nullable: true })
  @BusinessColumn({
    label: 'Titulaire',
    description: 'Nom du titulaire du compte/chèque',
    importance: 'medium',
    group: 'identification'
  })
  titulaire: string;

  @Column({
    type: 'enum',
    enum: StatutPaiement
  })
  @BusinessColumn({
    label: 'Statut',
    description: 'EN_ATTENTE, VALIDE, REJETE, ANNULE',
    importance: 'critical',
    group: 'état'
  })
  status: StatutPaiement;

  @Column({ type: 'text', nullable: true })
  @BusinessColumn({
    label: 'Notes',
    description: 'Commentaires internes sur le paiement',
    importance: 'low',
    group: 'interne'
  })
  notes: string;

  @Column({ name: 'preuve_paiement', nullable: true })
  @BusinessColumn({
    label: 'Preuve de paiement',
    description: 'Chemin du fichier justificatif',
    importance: 'low',
    group: 'document',
    ignored: true
  })
  preuvePaiement: string;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;

  @ManyToOne(() => Facture, facture => facture.paiements)
  @JoinColumn({ name: 'facture_id' })
  @BusinessColumn({
    label: 'Facture',
    description: 'Facture associée à ce paiement',
    importance: 'critical',
    group: 'relation'
  })
  facture: Facture;

  @DeleteDateColumn()
  deletedAt: Date;
}