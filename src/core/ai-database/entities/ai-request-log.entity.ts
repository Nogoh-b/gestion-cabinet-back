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

  @Column({ type: 'int', name: 'total_ms', nullable: true })
  total_ms: number | null;

  @Column({ type: 'int', name: 'first_token_ms', nullable: true })
  first_token_ms: number | null;

  @Column({ type: 'int', name: 'llm_calls', default: 0 })
  llm_calls: number;

  @Column({ type: 'int', name: 'estimated_prompt_tokens', default: 0 })
  estimated_prompt_tokens: number;

  @Column({ type: 'int', name: 'output_chars', default: 0 })
  output_chars: number;

  @Column({ type: 'varchar', length: 32, name: 'request_type', nullable: true })
  request_type: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  intent: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  model: string | null;

  @Column({ type: 'boolean', name: 'cache_hit', default: false })
  cache_hit: boolean;

  @Column({ type: 'varchar', length: 32, default: 'started' })
  status: string;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;
}
