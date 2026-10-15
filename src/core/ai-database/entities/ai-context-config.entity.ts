import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { TenantEntity } from '../../entities/tenant.entity';

@Entity('ai_context_configs')
@Index('UQ_ai_context_scope', ['tenant_id', 'resource_type', 'scope', 'operation_key'], { unique: true })
export class AiContextConfig extends TenantEntity {
  @PrimaryGeneratedColumn() id: number;
  @Column({ length: 80, default: '*' }) resource_type: string;
  @Column({ length: 32, default: '*' }) scope: string;
  @Column({ length: 120, default: '*' }) operation_key: string;
  @Column({ length: 200 }) label: string;
  @Column({ type: 'text', nullable: true }) instructions: string | null;
  @Column({ default: true }) enabled: boolean;
  @OneToMany(() => AiContextSuggestion, (suggestion) => suggestion.context) suggestions: AiContextSuggestion[];
}

@Entity('ai_context_suggestions')
@Index('UQ_ai_context_suggestion_code', ['tenant_id', 'context_id', 'code'], { unique: true })
export class AiContextSuggestion extends TenantEntity {
  @PrimaryGeneratedColumn() id: number;
  @Column() context_id: number;
  @ManyToOne(() => AiContextConfig, (context) => context.suggestions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'context_id' }) context: AiContextConfig;
  @Column({ length: 80 }) code: string;
  @Column({ length: 200 }) label: string;
  @Column({ type: 'text' }) prompt: string;
  @Column({ length: 16, default: 'read' }) intent: 'read' | 'prepare' | 'write';
  @Column({ type: 'varchar', length: 100, nullable: true }) permission: string | null;
  @Column({ default: 0 }) sort_order: number;
  @Column({ default: true }) enabled: boolean;
}
