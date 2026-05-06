// conversation-message.entity.ts
import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, CreateDateColumn } from 'typeorm';
import { Conversation } from './conversation.entity';

@Entity('conversation_messages')
export class ConversationMessage {
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

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => Conversation, conv => conv.messages)
  conversation: Conversation;
}