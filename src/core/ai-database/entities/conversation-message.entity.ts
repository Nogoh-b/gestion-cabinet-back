// conversation-message.entity.ts
import { Entity, Column, PrimaryGeneratedColumn, ManyToOne } from 'typeorm';
import { Conversation } from './conversation.entity';
import { TenantEntity as BaseEntity } from 'src/core/entities/tenant.entity';
import type { ReferencedEntityContext } from '../dto/ask-question.dto';

@Entity('conversation_messages')
export class ConversationMessage extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'conversation_id', type: 'varchar', length: 36 })
  conversationId: string;

  @Column({ type: 'enum', enum: ['system', 'user', 'assistant'] })
  role: 'system' | 'user' | 'assistant';

  @Column({ type: 'longtext' })
  content: string;

  @Column({ name: 'reasoning_content', type: 'text', nullable: true })
  reasoningContent: string;

  @Column({ name: 'tokens_used', type: 'int', default: 0 })
  tokensUsed: number;

  @Column({ type: 'json', nullable: true })
  references?: ReferencedEntityContext[];

  @Column({ type: 'json', nullable: true })
  metadata?: Record<string, any>;

  // created_at hérité de BaseEntity → pas de redéclaration
  get createdAt(): Date { return this.created_at; }

  @ManyToOne(() => Conversation, conv => conv.messages)
  conversation: Conversation;
}
