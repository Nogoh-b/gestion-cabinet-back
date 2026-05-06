import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DossierReferral } from './dossier-referral.entity';
import { BusinessTable, BusinessColumn } from 'src/core/decorators/business-metadata.decorator';
import { Facture } from 'src/modules/facture/entities/facture.entity';
import { Paiement } from 'src/modules/paiement/entities/paiement.entity';

export enum CommissionStatus {
  CALCULATED = 'calculated',
  APPROVED = 'approved',
  PAID = 'paid',
  CANCELLED = 'cancelled',
}

@Entity('referral_commission')
@BusinessTable({
  label: 'Commissions d\'apporteur',
  description: 'Commissions calculées, éditées et payées aux apporteurs.',
  icon: '💰',
  category: 'financier',
})
export class ReferralCommission {
  @PrimaryGeneratedColumn()
  @BusinessColumn({
    label: 'Identifiant',
    description: 'Identifiant unique',
    importance: 'low',
    group: 'technique',
    ignored: true,
  })
  id: number;

  @Column({ type: 'int', name: 'dossier_referral_id' })
  @BusinessColumn({
    label: 'Apport de dossier',
    description: 'Identifiant de l\'apport',
    importance: 'high',
    group: 'relation',
    ignored: true,
  })
  dossier_referral_id: number;

  @ManyToOne(() => DossierReferral, (referral) => referral.commissions, { nullable: false })
  @JoinColumn({ name: 'dossier_referral_id' })
  @BusinessColumn({
    label: 'Apport de dossier',
    description: 'Apport concerné',
    importance: 'high',
    group: 'relation',
  })
  dossier_referral: DossierReferral;

  @Column({ type: 'int', nullable: true, name: 'facture_id' })
  facture_id: number;

  @ManyToOne(() => Facture, { nullable: true })
  @JoinColumn({ name: 'facture_id' })
  @BusinessColumn({
    label: 'Facture client source',
    description: 'Facture dont le paiement a déclenché la commission',
    importance: 'medium',
    group: 'relation',
  })
  facture: Facture;

  @Column({ type: 'int', nullable: true, name: 'paiement_id' })
  paiement_id: number;

  @ManyToOne(() => Paiement, { nullable: true })
  @JoinColumn({ name: 'paiement_id' })
  @BusinessColumn({
    label: 'Paiement client source',
    description: 'Paiement du client ayant déclenché la commission',
    importance: 'medium',
    group: 'relation',
  })
  paiement: Paiement;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  @BusinessColumn({
    label: 'Montant de la commission',
    description: 'Montant calculé ou payé',
    unit: '€',
    importance: 'high',
    group: 'financier',
  })
  amount: number;

  @Column({ type: 'enum', enum: CommissionStatus, default: CommissionStatus.CALCULATED })
  @BusinessColumn({
    label: 'Statut',
    description: 'Calculée, approuvée, payée, annulée',
    importance: 'high',
    group: 'statut',
  })
  status: CommissionStatus;

  @Column({ type: 'date', name: 'calculation_date' })
  @BusinessColumn({
    label: 'Date de calcul',
    description: 'Date à laquelle la commission a été calculée',
    format: 'date',
    importance: 'medium',
    group: 'dates',
  })
  calculation_date: Date;

  @Column({ type: 'date', nullable: true, name: 'payment_date' })
  @BusinessColumn({
    label: 'Date de paiement',
    description: 'Date de paiement effectif',
    format: 'date',
    importance: 'medium',
    group: 'dates',
  })
  payment_date: Date;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'payment_reference' })
  @BusinessColumn({
    label: 'Référence du paiement',
    description: 'Numéro de transaction ou référence',
    importance: 'medium',
    group: 'financier',
  })
  payment_reference: string;

  @Column({ type: 'text', nullable: true })
  @BusinessColumn({
    label: 'Notes',
    description: 'Notes internes',
    importance: 'low',
    group: 'audit',
  })
  notes: string;

  @CreateDateColumn({ name: 'created_at' })
  @BusinessColumn({
    label: 'Date de création',
    description: 'Date de création dans le système',
    format: 'date',
    importance: 'low',
    group: 'audit',
    ignored: true,
  })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  @BusinessColumn({
    label: 'Date de modification',
    description: 'Date de dernière modification',
    format: 'date',
    importance: 'low',
    group: 'audit',
    ignored: true,
  })
  updated_at: Date;
}