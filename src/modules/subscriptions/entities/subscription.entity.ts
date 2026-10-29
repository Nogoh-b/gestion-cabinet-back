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
import { Plan } from 'src/modules/plans/entities/plan.entity';

export type BillingCycle = 'monthly' | 'yearly';
export type SubscriptionActorType =
  | 'system'
  | 'cabinet_user'
  | 'platform_admin';
export type SubscriptionStatus =
  | 'trial'
  | 'active'
  | 'expired'
  | 'suspended'
  | 'cancelled'
  /** Période payante créée mais en attente d'encaissement (gating paiement). */
  | 'pending_payment';

/**
 * Abonnement d'un cabinet à un plan.
 *
 * Entité AU NIVEAU PLATEFORME (comme `cabinets` et `plans`) : pas de colonne
 * `tenant_id`, donc non filtrée par le patch tenant. Le rattachement se fait
 * via `cabinet_id`.
 *
 * Le couple (cycle, started_at) détermine la date de fin (`ends_at`) — qui
 * sert au décompte affiché côté front. `ends_at = null` signifie « illimité »
 * (cas du plan gratuit selon la politique configurée).
 *
 * Aucun paiement réel n'est encore traité : la facturation est matérialisée
 * dans la table `subscription_payments` (statut `pending`) pour l'historique
 * et l'évolution future.
 */
@Entity('subscriptions')
@Index('IDX_subscriptions_cabinet_status', ['cabinet_id', 'status'])
// Lecture seule, limitée au cabinet courant (cabinet_id, voir ai-scoped-tables.ts).
@BusinessTable({
  label: 'Abonnements du cabinet',
  description:
    'Abonnement du cabinet courant à un plan : statut (trial=essai, active=actif, expired=expiré, suspended=suspendu, cancelled=résilié, pending_payment=en attente de paiement), cycle, dates de début et de fin, montant. Jointure plans via plan_id.',
  category: 'abonnement',
  readOnly: true,
})
export class Subscription {
  @PrimaryGeneratedColumn()
  @BusinessColumn({
    label: 'Identifiant',
    description: 'Non exposé',
    importance: 'low',
    ignored: true,
  })
  id: number;

  @Column({ type: 'int', name: 'cabinet_id' })
  @BusinessColumn({
    label: 'Cabinet',
    description: 'Non exposé',
    importance: 'low',
    ignored: true,
  })
  cabinet_id: number;

  @Column({ type: 'int', name: 'plan_id' })
  @BusinessColumn({ label: 'Plan', description: 'Plan souscrit (plans.id)' })
  plan_id: number;

  @ManyToOne(() => Plan, { nullable: true, eager: true })
  @JoinColumn({ name: 'plan_id' })
  plan: Plan;

  /** Cycle de facturation choisi par le cabinet. */
  @Column({
    type: 'enum',
    enum: ['monthly', 'yearly'],
    default: 'monthly',
    name: 'billing_cycle',
  })
  @BusinessColumn({
    label: 'Cycle de facturation',
    description: 'BD: monthly=Mensuel, yearly=Annuel',
  })
  billing_cycle: BillingCycle;

  @Column({
    type: 'enum',
    enum: [
      'trial',
      'active',
      'expired',
      'suspended',
      'cancelled',
      'pending_payment',
    ],
    default: 'trial',
  })
  @BusinessColumn({
    label: "Statut de l'abonnement",
    description:
      'BD: trial=Essai, active=Actif, expired=Expiré, suspended=Suspendu, cancelled=Résilié, pending_payment=En attente de paiement',
  })
  status: SubscriptionStatus;

  /** Début de la période courante. */
  @Column({ type: 'datetime', name: 'started_at' })
  @BusinessColumn({
    label: 'Début de période',
    description: 'Début de la période en cours',
    format: 'date',
  })
  started_at: Date;

  /** Fin de la période courante. `null` = illimité (pas de décompte). */
  @Column({ type: 'datetime', nullable: true, name: 'ends_at' })
  @BusinessColumn({
    label: 'Fin de période',
    description: 'Fin de la période en cours (vide = illimité)',
    format: 'date',
  })
  ends_at: Date | null;

  /**
   * Fin de la portion d'essai gratuite. `null` = pas d'essai.
   * Tant que `now < trial_ends_at`, `is_trial=true` et le décompte affiché vise
   * cette date. Une fois dépassée, `is_trial` bascule à `false` et le décompte
   * payant prend le relais vers `ends_at`.
   */
  @Column({ type: 'datetime', nullable: true, name: 'trial_ends_at' })
  @BusinessColumn({
    label: "Fin de l'essai",
    description: "Fin de la période d'essai gratuite",
    format: 'date',
  })
  trial_ends_at: Date | null;

  /** true tant que la période en cours est une période d'essai gratuite. */
  @Column({ type: 'boolean', default: false, name: 'is_trial' })
  @BusinessColumn({
    label: "En période d'essai",
    description: "Vrai pendant l'essai gratuit",
  })
  is_trial: boolean;

  /** Montant facturé pour la période (snapshot du prix du plan au moment T). */
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  @BusinessColumn({
    label: 'Montant de la période',
    description: 'Montant facturé pour la période',
    format: 'currency',
  })
  amount: number;

  @Column({ type: 'varchar', length: 10, default: 'XAF' })
  currency: string;

  /** Reconduction automatique à l'échéance (créera une nouvelle période). */
  @Column({ type: 'boolean', default: true, name: 'auto_renew' })
  @BusinessColumn({
    label: 'Renouvellement automatique',
    description: "Reconduction à l'échéance",
  })
  auto_renew: boolean;

  @Column({ type: 'datetime', nullable: true, name: 'cancelled_at' })
  cancelled_at: Date | null;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
    name: 'cancel_reason',
  })
  cancel_reason: string | null;

  /** Code promo appliqué à cet abonnement (platform_coupons). */
  @Column({ type: 'int', nullable: true, name: 'coupon_id' })
  @BusinessColumn({
    label: 'Code promo',
    description: 'Non exposé',
    importance: 'low',
    ignored: true,
  })
  coupon_id: number | null;

  /** Échéances futures restant à remiser (renouvellements). */
  @Column({ type: 'int', nullable: true, name: 'discount_cycles_remaining' })
  @BusinessColumn({
    label: 'Remises restantes',
    description: 'Non exposé',
    importance: 'low',
    ignored: true,
  })
  discount_cycles_remaining: number | null;

  /** Origine de la création : système, cabinet (self-service) ou plateforme. */
  @Column({
    type: 'varchar',
    length: 20,
    default: 'system',
    name: 'created_by',
  })
  @BusinessColumn({
    label: 'Origine',
    description: 'Non exposé',
    importance: 'low',
    ignored: true,
  })
  created_by: SubscriptionActorType;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
}
