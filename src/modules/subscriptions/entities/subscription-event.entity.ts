import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { SubscriptionActorType } from './subscription.entity';

export type SubscriptionEventType =
  | 'created'
  | 'renewed'
  | 'plan_changed'
  | 'cycle_changed'
  | 'extended'
  | 'free_period_granted'
  | 'trial_ended'
  | 'expired'
  | 'suspended'
  | 'reactivated'
  | 'cancelled'
  | 'payment_paid'
  | 'payment_failed'
  | 'payment_declared'
  | 'payment_rejected'
  | 'payment_refunded'
  | 'payment_recorded'
  | 'payment_waived'
  | 'coupon_applied'
  | 'reminder_sent';

/**
 * Historique des transitions d'abonnement d'un cabinet (timeline, churn,
 * dédoublonnage des relances). Entité AU NIVEAU PLATEFORME.
 */
@Entity('subscription_events')
@Index('IDX_subscription_events_cabinet', ['cabinet_id', 'created_at'])
@Index('IDX_subscription_events_type', ['type', 'created_at'])
@Index('IDX_subscription_events_subscription', ['subscription_id'])
export class SubscriptionEvent {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', name: 'cabinet_id' })
  cabinet_id: number;

  @Column({ type: 'int', name: 'subscription_id', nullable: true })
  subscription_id: number | null;

  @Column({ type: 'varchar', length: 40 })
  type: SubscriptionEventType;

  @Column({
    type: 'varchar',
    length: 20,
    name: 'actor_type',
    default: 'system',
  })
  actor_type: SubscriptionActorType;

  @Column({ type: 'int', name: 'actor_id', nullable: true })
  actor_id: number | null;

  @Column({ type: 'varchar', length: 150, name: 'actor_label', nullable: true })
  actor_label: string | null;

  @Column({ type: 'json', nullable: true })
  payload: Record<string, any> | null;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;
}
