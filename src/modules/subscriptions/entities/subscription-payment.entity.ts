import {
  Entity,
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
  | 'paid'
  | 'failed'
  | 'refunded';

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
    enum: ['pending', 'paid', 'failed', 'refunded'],
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
  @Column({ type: 'varchar', length: 512, nullable: true, name: 'checkout_url' })
  checkout_url: string | null;

  /** Dernier événement de webhook traité pour garantir l'idempotence. */
  @Column({
    type: 'varchar',
    length: 128,
    nullable: true,
    unique: true,
    name: 'last_webhook_event_id',
  })
  last_webhook_event_id: string | null;

  @Column({ type: 'datetime', nullable: true, name: 'last_webhook_at' })
  last_webhook_at: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
}
