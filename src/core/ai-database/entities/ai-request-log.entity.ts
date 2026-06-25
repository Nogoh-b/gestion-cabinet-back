import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Journal léger des requêtes IA, par cabinet, pour l'application du quota
 * mensuel `ai_requests_per_month` du plan.
 *
 * Volontairement isolé du reste du module ai-database (une ligne par requête,
 * comptée sur le mois courant). `tenant_id` est reconnu par le patch tenant →
 * estampillage automatique à l'insertion et filtrage automatique au comptage.
 */
@Entity('ai_request_log')
@Index('IDX_ai_request_tenant_date', ['tenant_id', 'created_at'])
export class AiRequestLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', name: 'tenant_id' })
  tenant_id: number;

  @Column({ type: 'int', name: 'user_id', nullable: true })
  user_id: number | null;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;
}
