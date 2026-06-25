import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Plan } from 'src/modules/plans/entities/plan.entity';

export type BillingCycle = 'monthly' | 'yearly';
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
export class Subscription {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', name: 'cabinet_id' })
  cabinet_id: number;

  @Column({ type: 'int', name: 'plan_id' })
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
  billing_cycle: BillingCycle;

  @Column({
    type: 'enum',
    enum: ['trial', 'active', 'expired', 'suspended', 'cancelled', 'pending_payment'],
    default: 'trial',
  })
  status: SubscriptionStatus;

  /** Début de la période courante. */
  @Column({ type: 'datetime', name: 'started_at' })
  started_at: Date;

  /** Fin de la période courante. `null` = illimité (pas de décompte). */
  @Column({ type: 'datetime', nullable: true, name: 'ends_at' })
  ends_at: Date | null;

  /**
   * Fin de la portion d'essai gratuite. `null` = pas d'essai.
   * Tant que `now < trial_ends_at`, `is_trial=true` et le décompte affiché vise
   * cette date. Une fois dépassée, `is_trial` bascule à `false` et le décompte
   * payant prend le relais vers `ends_at`.
   */
  @Column({ type: 'datetime', nullable: true, name: 'trial_ends_at' })
  trial_ends_at: Date | null;

  /** true tant que la période en cours est une période d'essai gratuite. */
  @Column({ type: 'boolean', default: false, name: 'is_trial' })
  is_trial: boolean;

  /** Montant facturé pour la période (snapshot du prix du plan au moment T). */
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  amount: number;

  @Column({ type: 'varchar', length: 10, default: 'XAF' })
  currency: string;

  /** Reconduction automatique à l'échéance (créera une nouvelle période). */
  @Column({ type: 'boolean', default: true, name: 'auto_renew' })
  auto_renew: boolean;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
}
