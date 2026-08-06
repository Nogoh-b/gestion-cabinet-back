import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { DossierReferral } from './dossier-referral.entity';
import { BusinessTable, BusinessColumn } from 'src/core/decorators/business-metadata.decorator';
import { TenantEntity } from 'src/core/entities/tenant.entity';
import { Facture } from 'src/modules/facture/entities/facture.entity';
import { Paiement } from 'src/modules/paiement/entities/paiement.entity';
import { User } from 'src/modules/iam/user/entities/user.entity';

export enum CommissionStatus {
  CALCULATED = 'calculated',
  APPROVED = 'approved',
  PAID = 'paid',
  CANCELLED = 'cancelled',
}

export enum CommissionPaymentMethod {
  BANK_TRANSFER = 'bank_transfer',
  CASH = 'cash',
  MOBILE_MONEY = 'mobile_money',
  CHECK = 'check',
  OTHER = 'other',
}

@Entity('referral_commission')
@Index(
  'UQ_referral_commission_tenant_facture',
  ['tenant_id', 'dossier_referral_id', 'facture_id'],
  { unique: true },
)
@Index(
  'UQ_referral_commission_tenant_paiement',
  ['tenant_id', 'paiement_id'],
  { unique: true },
)
@BusinessTable({
  label: 'Commissions d\'apporteur',
  description: 'Commissions calculées, éditées et payées aux apporteurs.',
  icon: '💰',
  category: 'financier',
})
export class ReferralCommission extends TenantEntity {
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

  // ⚠️ Facture.id est un UUID (PrimaryGeneratedColumn('uuid')) → la colonne FK
  // doit être varchar(36), pas int, sinon la valeur UUID est coercée et la
  // contrainte FK échoue.
  @Column({ type: 'varchar', length: 36, nullable: true, name: 'facture_id' })
  facture_id: string | null;

  @ManyToOne(() => Facture, { nullable: true })
  @JoinColumn({ name: 'facture_id' })
  @BusinessColumn({
    label: 'Facture client source',
    description: 'Facture dont le paiement a déclenché la commission',
    importance: 'medium',
    group: 'relation',
  })
  facture: Facture | null;

  // ⚠️ Paiement.id est également un UUID → varchar(36).
  @Column({ type: 'varchar', length: 36, nullable: true, name: 'paiement_id' })
  paiement_id: string | null;

  @ManyToOne(() => Paiement, { nullable: true })
  @JoinColumn({ name: 'paiement_id' })
  @BusinessColumn({
    label: 'Paiement client source',
    description: 'Paiement du client ayant déclenché la commission',
    importance: 'medium',
    group: 'relation',
  })
  paiement: Paiement | null;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
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
    description: "BD: 'calculated'=Calculée, 'approved'=Approuvée, 'paid'=Payée, 'cancelled'=Annulée.",
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

  @Column({ type: 'datetime', precision: 6, nullable: true, name: 'payment_date' })
  @BusinessColumn({
    label: 'Date de paiement',
    description: 'Date de paiement effectif',
    format: 'date',
    importance: 'medium',
    group: 'dates',
  })
  payment_date: Date | null;

  @Column({
    type: 'enum',
    enum: CommissionPaymentMethod,
    nullable: true,
    name: 'payment_method',
  })
  payment_method: CommissionPaymentMethod | null;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'payment_reference' })
  @BusinessColumn({
    label: 'Référence du paiement',
    description: 'Numéro de transaction ou référence',
    importance: 'medium',
    group: 'financier',
  })
  payment_reference: string | null;

  @Column({ type: 'text', nullable: true })
  @BusinessColumn({
    label: 'Notes',
    description: 'Notes internes',
    importance: 'low',
    group: 'audit',
  })
  notes: string | null;

  @Column({ type: 'int', nullable: true, name: 'calculated_by_id' })
  calculated_by_id: number | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'calculated_by_id' })
  calculated_by: User | null;

  @Column({ type: 'int', nullable: true, name: 'approved_by_id' })
  approved_by_id: number | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'approved_by_id' })
  approved_by: User | null;

  @Column({
    type: 'datetime',
    precision: 6,
    nullable: true,
    name: 'approved_at',
  })
  approved_at: Date | null;

  @Column({ type: 'int', nullable: true, name: 'paid_by_id' })
  paid_by_id: number | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'paid_by_id' })
  paid_by: User | null;

  @Column({ type: 'int', nullable: true, name: 'cancelled_by_id' })
  cancelled_by_id: number | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'cancelled_by_id' })
  cancelled_by: User | null;

  @Column({
    type: 'datetime',
    precision: 6,
    nullable: true,
    name: 'cancelled_at',
  })
  cancelled_at: Date | null;

  @Column({ type: 'text', nullable: true, name: 'cancellation_reason' })
  cancellation_reason: string | null;

}
