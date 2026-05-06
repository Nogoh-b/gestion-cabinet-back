// conversation.entity.ts
import { Entity, Column, PrimaryColumn, OneToMany, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { ConversationMessage } from './conversation-message.entity';

@Entity('conversations_bot')
export class Conversation {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id: string;

  @Column({ name: 'user_id', type: 'varchar', length: 255 })
  userId: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  title: string;

  @Column({ type: 'enum', enum: ['active', 'archived'], default: 'active' })
  status: 'active' | 'archived';

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => ConversationMessage, message => message.conversation)
  messages: ConversationMessage[];
}