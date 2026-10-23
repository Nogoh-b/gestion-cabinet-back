import {
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Subscription } from './subscription.entity';

export type SubscriptionPaymentStatus =
  | 'pending'
  /** Paiement manuel déclaré par le cabinet, en attente de validation plateforme. */
  | 'awaiting_validation'
  | 'paid'
  | 'failed'
  | 'refunded'
  /** Échéance annulée (abonnement remplacé, échéance offerte). */
  | 'cancelled';

/**
 * Nature du paiement : une échéance d'abonnement, ou l'achat d'un pack de
 * crédits IA (réutilise les passerelles mais ne touche jamais à l'abonnement).
 */
export type SubscriptionPaymentKind = 'subscription' | 'ai_credits';

export const SUBSCRIPTION_PAYMENT_STATUSES: SubscriptionPaymentStatus[] = [
  'pending',
  'awaiting_validation',
  'paid',
  'failed',
  'refunded',
  'cancelled',
];

/**
 * Échéance / paiement rattaché à un abonnement.
 *
 * Pour l'instant aucun encaissement réel n'a lieu : chaque période génère un
 * enregistrement `pending` (montant dû, dates de période). Cela constitue
 * l'historique de facturation et prépare l'intégration d'un vrai paiement
 * (mobile money, carte, virement) sans changer le modèle.
 *
 * Entité AU NIVEAU PLATEFORME (pas de `tenant_id`).
 */
@Entity('subscription_payments')
@Index('IDX_subscription_payments_status_paid', ['status', 'paid_at'])
@Index('IDX_subscription_payments_paid_at', ['paid_at'])
@Index('IDX_subscription_payments_refunded_at', ['refunded_at'])
@Index('IDX_subscription_payments_reference', ['reference'])
@Index('UQ_subscription_payments_receipt', ['receipt_number'], { unique: true })
export class SubscriptionPayment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', name: 'subscription_id' })
  subscription_id: number;

  @ManyToOne(() => Subscription, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'subscription_id' })
  subscription: Subscription;

  /** Dénormalisé pour requêter facilement l'historique d'un cabinet. */
  @Column({ type: 'int', name: 'cabinet_id' })
  cabinet_id: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  amount: number;

  @Column({ type: 'varchar', length: 10, default: 'XAF' })
  currency: string;

  @Column({
    type: 'enum',
    enum: SUBSCRIPTION_PAYMENT_STATUSES,
    default: 'pending',
  })
  status: SubscriptionPaymentStatus;

  /** Date d'échéance du paiement. */
  @Column({ type: 'date', name: 'due_date' })
  due_date: Date;

  /** Date d'encaissement effectif (null tant que non payé). */
  @Column({ type: 'datetime', nullable: true, name: 'paid_at' })
  paid_at: Date | null;

  @Column({ type: 'date', name: 'period_start' })
  period_start: Date;

  /** Fin de période couverte (null = illimité). */
  @Column({ type: 'date', nullable: true, name: 'period_end' })
  period_end: Date | null;

  /** Moyen de paiement (ex: mobile_money, card, transfer) — null pour l'instant. */
  @Column({ type: 'varchar', length: 30, nullable: true })
  method: string | null;

  /** Référence de transaction externe (fournie par la passerelle). */
  @Column({ type: 'varchar', length: 100, nullable: true })
  reference: string | null;

  /** Passerelle utilisée (ex: test, cinetpay, stripe). */
  @Column({ type: 'varchar', length: 30, nullable: true })
  provider: string | null;

  /** URL de paiement (page de la passerelle) à présenter au client. */
  @Column({
    type: 'varchar',
    length: 512,
    nullable: true,
    name: 'checkout_url',
  })
  checkout_url: string | null;

  /** Moyen de paiement choisi (platform_payment_methods). */
  @Column({ type: 'int', nullable: true, name: 'payment_method_id' })
  payment_method_id: number | null;

  /** Identifiant côté passerelle (ex. session Stripe, référence NotchPay). */
  @Column({ type: 'varchar', length: 255, nullable: true, name: 'provider_reference' })
  provider_reference: string | null;

  /** Montant avant remise (null = pas de remise). `amount` reste le net dû. */
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true, name: 'amount_gross' })
  amount_gross: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0, name: 'discount_amount' })
  discount_amount: number;

  /** Frais prélevés par la passerelle (estimés depuis la configuration du moyen). */
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0, name: 'fee_amount' })
  fee_amount: number;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'failure_reason' })
  failure_reason: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true, name: 'declared_reference' })
  declared_reference: string | null;

  @Column({ type: 'datetime', nullable: true, name: 'declared_at' })
  declared_at: Date | null;

  /** Chemin privé du justificatif (hors /uploads public). */
  @Column({ type: 'varchar', length: 255, nullable: true, name: 'proof_file' })
  proof_file: string | null;

  @Column({ type: 'int', nullable: true, name: 'validated_by_admin_id' })
  validated_by_admin_id: number | null;

  @Column({ type: 'datetime', nullable: true, name: 'validated_at' })
  validated_at: Date | null;

  @Column({ type: 'datetime', nullable: true, name: 'refunded_at' })
  refunded_at: Date | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true, name: 'refund_amount' })
  refund_amount: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'refund_reason' })
  refund_reason: string | null;

  @Column({ type: 'varchar', length: 20, default: 'subscription' })
  kind: SubscriptionPaymentKind;

  /** Pack de crédits IA acheté (kind = 'ai_credits'). */
  @Column({ type: 'int', nullable: true, name: 'ai_credit_pack_id' })
  ai_credit_pack_id: number | null;

  /** Crédits IA vendus par ce paiement (figés à l'achat). */
  @Column({ type: 'decimal', precision: 14, scale: 4, nullable: true, name: 'ai_credits' })
  ai_credits: number | null;

  /** Numéro du reçu (attribué à l'encaissement). */
  @Column({ type: 'varchar', length: 40, nullable: true, name: 'receipt_number' })
  receipt_number: string | null;

  /** Dernière réponse de la passerelle (vérification / webhook). */
  @Column({ type: 'json', nullable: true, name: 'provider_payload' })
  provider_payload: Record<string, any> | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  notes: string | null;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
}
