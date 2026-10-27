import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Notification reçue d'une passerelle. L'unicité (provider, event_id) bloque
 * le rejeu ; la signature et le résultat du traitement sont conservés pour
 * l'audit et le diagnostic.
 */
@Entity('payment_webhook_events')
@Index('UQ_payment_webhook_events', ['provider', 'event_id'], { unique: true })
@Index('IDX_payment_webhook_events_payment', ['payment_id'])
export class PaymentWebhookEvent {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 30 })
  provider: string;

  @Column({ type: 'varchar', length: 191, name: 'event_id' })
  event_id: string;

  @Column({ type: 'int', name: 'payment_id', nullable: true })
  payment_id: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  reference: string | null;

  @Column({ type: 'boolean', name: 'signature_valid', default: false })
  signature_valid: boolean;

  @Column({ type: 'json', nullable: true })
  payload: Record<string, any> | null;

  @Column({ type: 'datetime', name: 'processed_at', nullable: true })
  processed_at: Date | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  error: string | null;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;
}
