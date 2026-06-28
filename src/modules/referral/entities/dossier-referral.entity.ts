import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { Dossier } from '../../dossiers/entities/dossier.entity';
import { BusinessTable, BusinessColumn } from 'src/core/decorators/business-metadata.decorator';
import { TenantEntity } from 'src/core/entities/tenant.entity';
import { Referrer } from './referral.entity';
import { ReferralCommission } from './referral-commission.entity';

export enum CommissionBasis {
  INVOICED_HT = 'invoiced_ht',
  INVOICED_TTC = 'invoiced_ttc',
  COLLECTED_HT = 'collected_ht',
  COLLECTED_TTC = 'collected_ttc',
}

export enum CommissionMode {
  RATE = 'rate',
  FIXED_AMOUNT = 'fixed_amount',
}

@Entity('dossier_referral')
@BusinessTable({
  label: 'Apports de dossiers',
  description: 'Lie un dossier à son apporteur avec les conditions spécifiques de commission.',
  icon: '📎',
  category: 'tiers',
})
export class DossierReferral extends TenantEntity {
  @PrimaryGeneratedColumn()
  @BusinessColumn({
    label: 'Identifiant',
    description: 'Identifiant unique',
    importance: 'low',
    group: 'technique',
    ignored: true,
  })
  id: number;

  @Column({ type: 'int', unique: true, name: 'dossier_id' })
  @BusinessColumn({
    label: 'Dossier',
    description: 'Un dossier a au plus un apporteur',
    importance: 'high',
    group: 'relation',
    ignored: true,
  })
  dossier_id: number;

  @ManyToOne(() => Dossier, { nullable: false })
  @JoinColumn({ name: 'dossier_id' })
  @BusinessColumn({
    label: 'Dossier',
    description: 'Dossier apporté',
    importance: 'high',
    group: 'relation',
  })
  dossier: Dossier;

  @Column({ type: 'int', name: 'referrer_id' })
  @BusinessColumn({
    label: 'Apporteur',
    description: 'Identifiant de l\'apporteur',
    importance: 'high',
    group: 'relation',
    ignored: true,
  })
  referrer_id: number;

  @ManyToOne(() => Referrer, (referrer) => referrer.dossier_referrals, { nullable: false })
  @JoinColumn({ name: 'referrer_id' })
  @BusinessColumn({
    label: 'Apporteur',
    description: 'Apporteur du dossier',
    importance: 'high',
    group: 'relation',
  })
  referrer: Referrer;

  @Column({ type: 'decimal', precision: 5, scale: 2, name: 'commission_rate' })
  @BusinessColumn({
    label: 'Taux de commission (%)',
    description: 'Taux applicable pour ce dossier',
    example: '10.0',
    unit: '%',
    importance: 'high',
    group: 'financier',
  })
  commission_rate: number;

  @Column({ type: 'enum', enum: CommissionMode, default: CommissionMode.RATE, name: 'commission_mode' })
  @BusinessColumn({
    label: 'Mode de commission',
    description: "BD: 'rate'=Commission par taux, 'fixed_amount'=Montant fixe.",
    importance: 'high',
    group: 'financier',
  })
  commission_mode: CommissionMode;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true, name: 'commission_amount' })
  @BusinessColumn({
    label: 'Montant fixe de commission',
    description: 'Montant fixe negocie pour ce dossier',
    importance: 'high',
    group: 'financier',
  })
  commission_amount: number | null;

  @Column({ type: 'enum', enum: CommissionBasis, default: CommissionBasis.COLLECTED_HT, name: 'commission_basis' })
  @BusinessColumn({
    label: 'Base de calcul',
    description: "BD: 'invoiced_ht', 'invoiced_ttc', 'collected_ht', 'collected_ttc'.",
    importance: 'medium',
    group: 'financier',
  })
  commission_basis: CommissionBasis;

  @Column({ type: 'date', name: 'referral_date' })
  @BusinessColumn({
    label: 'Date d\'apport',
    description: 'Date à laquelle le dossier a été apporté',
    format: 'date',
    importance: 'medium',
    group: 'dates',
  })
  referral_date: Date;

  @Column({ type: 'text', nullable: true })
  @BusinessColumn({
    label: 'Conditions particulières',
    description: 'Notes sur les conditions spécifiques',
    importance: 'low',
    group: 'audit',
  })
  notes: string;

  @OneToMany(() => ReferralCommission, (commission) => commission.dossier_referral)
  commissions: ReferralCommission[];

}
