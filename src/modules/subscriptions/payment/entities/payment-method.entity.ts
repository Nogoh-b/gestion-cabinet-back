import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type PaymentMethodKind = 'gateway' | 'manual';
export type PaymentProviderCode = 'cinetpay' | 'notchpay' | 'stripe' | 'test';
export type PaymentMode = 'sandbox' | 'live';

/**
 * Moyen de paiement proposé aux cabinets pour régler leur abonnement.
 *
 *  - `manual`  : virement, Mobile Money direct, espèces… Le cabinet déclare
 *    son paiement ; la plateforme le valide.
 *  - `gateway` : passerelle en ligne (CinetPay, NotchPay, Stripe, test).
 *
 * `secret_config` est un JSON chiffré (AES-256-GCM, PAYMENT_CONFIG_ENCRYPTION_KEY) :
 * jamais renvoyé tel quel au front. `public_config` contient les informations
 * affichables (instructions, RIB, numéros, canaux).
 * Entité AU NIVEAU PLATEFORME.
 */
@Entity('platform_payment_methods')
export class PaymentMethod {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 40, unique: true })
  code: string;

  @Column({ type: 'varchar', length: 100 })
  label: string;

  @Column({ type: 'enum', enum: ['gateway', 'manual'] })
  kind: PaymentMethodKind;

  @Column({ type: 'varchar', length: 30, nullable: true })
  provider: PaymentProviderCode | null;

  @Column({ type: 'enum', enum: ['sandbox', 'live'], default: 'sandbox' })
  mode: PaymentMode;

  @Column({ type: 'boolean', name: 'is_active', default: false })
  is_active: boolean;

  @Column({ type: 'text', name: 'secret_config', nullable: true, select: false })
  secret_config: string | null;

  @Column({ type: 'json', name: 'public_config', nullable: true })
  public_config: Record<string, any> | null;

  @Column({ type: 'json', nullable: true })
  currencies: string[] | null;

  @Column({ type: 'decimal', precision: 5, scale: 2, name: 'fee_percent', default: 0 })
  fee_percent: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, name: 'fee_fixed', default: 0 })
  fee_fixed: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, name: 'min_amount', default: 0 })
  min_amount: number;

  @Column({ type: 'int', name: 'sort_order', default: 0 })
  sort_order: number;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
}
