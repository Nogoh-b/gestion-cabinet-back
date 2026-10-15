import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type CouponType = 'percent' | 'fixed' | 'free_months';
export type CouponCycle = 'any' | 'monthly' | 'yearly';

/**
 * Code promo applicable aux abonnements.
 *  - percent     : remise en % du montant de l'échéance ;
 *  - fixed       : remise d'un montant fixe (devise de l'échéance) ;
 *  - free_months : N mois ajoutés à la période payée (prix inchangé).
 * `duration_cycles` : nombre d'échéances remisées (null = la première seule).
 * Entité AU NIVEAU PLATEFORME.
 */
@Entity('platform_coupons')
export class Coupon {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 40, unique: true })
  code: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description: string | null;

  @Column({ type: 'enum', enum: ['percent', 'fixed', 'free_months'] })
  type: CouponType;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  value: number;

  /** Plans éligibles (null = tous). */
  @Column({ type: 'json', name: 'plan_ids', nullable: true })
  plan_ids: number[] | null;

  @Column({ type: 'enum', enum: ['any', 'monthly', 'yearly'], default: 'any' })
  cycle: CouponCycle;

  @Column({ type: 'int', name: 'duration_cycles', nullable: true })
  duration_cycles: number | null;

  @Column({ type: 'int', name: 'max_redemptions', nullable: true })
  max_redemptions: number | null;

  @Column({ type: 'int', name: 'max_per_cabinet', default: 1 })
  max_per_cabinet: number;

  @Column({ type: 'int', name: 'redeemed_count', default: 0 })
  redeemed_count: number;

  @Column({ type: 'datetime', name: 'valid_from', nullable: true })
  valid_from: Date | null;

  @Column({ type: 'datetime', name: 'valid_until', nullable: true })
  valid_until: Date | null;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  is_active: boolean;

  @Column({ type: 'int', name: 'created_by_admin_id', nullable: true })
  created_by_admin_id: number | null;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
}

@Entity('coupon_redemptions')
@Index('IDX_coupon_redemptions_coupon', ['coupon_id'])
@Index('IDX_coupon_redemptions_cabinet', ['cabinet_id'])
export class CouponRedemption {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', name: 'coupon_id' })
  coupon_id: number;

  @Column({ type: 'int', name: 'cabinet_id' })
  cabinet_id: number;

  @Column({ type: 'int', name: 'subscription_id', nullable: true })
  subscription_id: number | null;

  @Column({ type: 'int', name: 'payment_id', nullable: true })
  payment_id: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, name: 'discount_amount', default: 0 })
  discount_amount: number;

  @Column({ type: 'int', name: 'free_months', default: 0 })
  free_months: number;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;
}
