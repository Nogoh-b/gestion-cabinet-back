import {
  BusinessColumn,
  BusinessTable,
} from 'src/core/decorators/business-metadata.decorator';
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
// Lecture seule, limitée au cabinet courant (cabinet_id, voir ai-scoped-tables.ts).
@BusinessTable({
  label: "Paiements d'abonnement",
  description:
    "Échéances et paiements de l'abonnement du cabinet courant : montant, statut (pending=à payer, awaiting_validation=en attente de validation, paid=payé, failed=échoué, refunded=remboursé, cancelled=annulé), échéance, date de paiement, période couverte, numéro de reçu.",
  category: 'abonnement',
  readOnly: true,
})
export class SubscriptionPayment {
  @PrimaryGeneratedColumn()
  @BusinessColumn({
    label: 'Identifiant',
    description: 'Non exposé',
    importance: 'low',
    ignored: true,
  })
  id: number;

  @Column({ type: 'int', name: 'subscription_id' })
  subscription_id: number;

  @ManyToOne(() => Subscription, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'subscription_id' })
  subscription: Subscription;

  /** Dénormalisé pour requêter facilement l'historique d'un cabinet. */
  @Column({ type: 'int', name: 'cabinet_id' })
  @BusinessColumn({
    label: 'Cabinet',
    description: 'Non exposé',
    importance: 'low',
    ignored: true,
  })
  cabinet_id: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  @BusinessColumn({
    label: 'Montant',
    description: 'Montant net dû',
    format: 'currency',
  })
  amount: number;

  @Column({ type: 'varchar', length: 10, default: 'XAF' })
  currency: string;

  @Column({
    type: 'enum',
    enum: SUBSCRIPTION_PAYMENT_STATUSES,
    default: 'pending',
  })
  @BusinessColumn({
    label: 'Statut du paiement',
    description:
      'BD: pending=À payer, awaiting_validation=En attente de validation, paid=Payé, failed=Échoué, refunded=Remboursé, cancelled=Annulé',
  })
  status: SubscriptionPaymentStatus;

  /** Date d'échéance du paiement. */
  @Column({ type: 'date', name: 'due_date' })
  @BusinessColumn({
    label: 'Échéance',
    description: "Date d'échéance du paiement",
    format: 'date',
  })
  due_date: Date;

  /** Date d'encaissement effectif (null tant que non payé). */
  @Column({ type: 'datetime', nullable: true, name: 'paid_at' })
  @BusinessColumn({
    label: 'Payé le',
    description: "Date d'encaissement",
    format: 'date',
  })
  paid_at: Date | null;

  @Column({ type: 'date', name: 'period_start' })
  @BusinessColumn({
    label: 'Début de période',
    description: 'Début de la période couverte',
    format: 'date',
  })
  period_start: Date;

  /** Fin de période couverte (null = illimité). */
  @Column({ type: 'date', nullable: true, name: 'period_end' })
  @BusinessColumn({
    label: 'Fin de période',
    description: 'Fin de la période couverte',
    format: 'date',
  })
  period_end: Date | null;

  /** Moyen de paiement (ex: mobile_money, card, transfer) — null pour l'instant. */
  @Column({ type: 'varchar', length: 30, nullable: true })
  @BusinessColumn({
    label: 'Moyen de paiement',
    description: 'mobile_money, card, transfer…',
  })
  method: string | null;

  /** Référence de transaction externe (fournie par la passerelle). */
  @Column({ type: 'varchar', length: 100, nullable: true })
  @BusinessColumn({
    label: 'Référence',
    description: 'Référence de la transaction',
  })
  reference: string | null;

  /** Passerelle utilisée (ex: test, cinetpay, stripe). */
  @Column({ type: 'varchar', length: 30, nullable: true })
  @BusinessColumn({
    label: 'Passerelle',
    description: 'Non exposé',
    importance: 'low',
    ignored: true,
  })
  provider: string | null;

  /** URL de paiement (page de la passerelle) à présenter au client. */
  @Column({
    type: 'varchar',
    length: 512,
    nullable: true,
    name: 'checkout_url',
  })
  @BusinessColumn({
    label: 'Lien de paiement',
    description: 'Non exposé',
    importance: 'low',
    ignored: true,
  })
  checkout_url: string | null;

  /** Moyen de paiement choisi (platform_payment_methods). */
  @Column({ type: 'int', nullable: true, name: 'payment_method_id' })
  @BusinessColumn({
    label: 'Moyen de paiement',
    description: 'Non exposé',
    importance: 'low',
    ignored: true,
  })
  payment_method_id: number | null;

  /** Identifiant côté passerelle (ex. session Stripe, référence NotchPay). */
  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
    name: 'provider_reference',
  })
  @BusinessColumn({
    label: 'Référence passerelle',
    description: 'Non exposé',
    importance: 'low',
    ignored: true,
  })
  provider_reference: string | null;

  /** Montant avant remise (null = pas de remise). `amount` reste le net dû. */
  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    name: 'amount_gross',
  })
  amount_gross: number | null;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
    name: 'discount_amount',
  })
  discount_amount: number;

  /** Frais prélevés par la passerelle (estimés depuis la configuration du moyen). */
  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
    name: 'fee_amount',
  })
  @BusinessColumn({
    label: 'Frais de passerelle',
    description: 'Non exposé',
    importance: 'low',
    ignored: true,
  })
  fee_amount: number;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
    name: 'failure_reason',
  })
  @BusinessColumn({
    label: "Motif d'échec",
    description: "Raison de l'échec du paiement",
  })
  failure_reason: string | null;

  @Column({
    type: 'varchar',
    length: 120,
    nullable: true,
    name: 'declared_reference',
  })
  @BusinessColumn({
    label: 'Référence déclarée',
    description: 'Non exposé',
    importance: 'low',
    ignored: true,
  })
  declared_reference: string | null;

  @Column({ type: 'datetime', nullable: true, name: 'declared_at' })
  @BusinessColumn({
    label: 'Déclaré le',
    description: 'Non exposé',
    importance: 'low',
    ignored: true,
  })
  declared_at: Date | null;

  /** Chemin privé du justificatif (hors /uploads public). */
  @Column({ type: 'varchar', length: 255, nullable: true, name: 'proof_file' })
  @BusinessColumn({
    label: 'Justificatif',
    description: 'Non exposé',
    importance: 'low',
    ignored: true,
  })
  proof_file: string | null;

  @Column({ type: 'int', nullable: true, name: 'validated_by_admin_id' })
  @BusinessColumn({
    label: 'Validé par',
    description: 'Non exposé',
    importance: 'low',
    ignored: true,
  })
  validated_by_admin_id: number | null;

  @Column({ type: 'datetime', nullable: true, name: 'validated_at' })
  @BusinessColumn({
    label: 'Validé le',
    description: 'Non exposé',
    importance: 'low',
    ignored: true,
  })
  validated_at: Date | null;

  @Column({ type: 'datetime', nullable: true, name: 'refunded_at' })
  refunded_at: Date | null;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    name: 'refund_amount',
  })
  @BusinessColumn({
    label: 'Montant remboursé',
    description: 'Non exposé',
    importance: 'low',
    ignored: true,
  })
  refund_amount: number | null;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
    name: 'refund_reason',
  })
  @BusinessColumn({
    label: 'Motif du remboursement',
    description: 'Non exposé',
    importance: 'low',
    ignored: true,
  })
  refund_reason: string | null;

  @Column({ type: 'varchar', length: 20, default: 'subscription' })
  @BusinessColumn({
    label: 'Nature',
    description: 'Non exposé',
    importance: 'low',
    ignored: true,
  })
  kind: SubscriptionPaymentKind;

  /** Pack de crédits IA acheté (kind = 'ai_credits'). */
  @Column({ type: 'int', nullable: true, name: 'ai_credit_pack_id' })
  @BusinessColumn({
    label: 'Pack IA',
    description: 'Non exposé',
    importance: 'low',
    ignored: true,
  })
  ai_credit_pack_id: number | null;

  /** Crédits IA vendus par ce paiement (figés à l'achat). */
  @Column({
    type: 'decimal',
    precision: 14,
    scale: 4,
    nullable: true,
    name: 'ai_credits',
  })
  @BusinessColumn({
    label: 'Crédits IA',
    description: 'Non exposé',
    importance: 'low',
    ignored: true,
  })
  ai_credits: number | null;

  /** Numéro du reçu (attribué à l'encaissement). */
  @Column({
    type: 'varchar',
    length: 40,
    nullable: true,
    name: 'receipt_number',
  })
  @BusinessColumn({
    label: 'Numéro de reçu',
    description: 'Numéro du reçu de paiement',
  })
  receipt_number: string | null;

  /** Dernière réponse de la passerelle (vérification / webhook). */
  @Column({ type: 'json', nullable: true, name: 'provider_payload' })
  @BusinessColumn({
    label: 'Réponse passerelle',
    description: 'Non exposé',
    importance: 'low',
    ignored: true,
  })
  provider_payload: Record<string, any> | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  @BusinessColumn({
    label: 'Notes',
    description: 'Non exposé',
    importance: 'low',
    ignored: true,
  })
  notes: string | null;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
}
