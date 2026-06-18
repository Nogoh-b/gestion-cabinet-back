// conversation.entity.ts
import { Entity, Column, PrimaryColumn, OneToMany } from 'typeorm';
import { ConversationMessage } from './conversation-message.entity';
import { TenantEntity as BaseEntity } from 'src/core/entities/tenant.entity';

@Entity('conversations_bot')
export class Conversation extends BaseEntity {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id: string;

  @Column({ name: 'user_id', type: 'varchar', length: 255 })
  userId: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  title: string;

  @Column({ type: 'enum', enum: ['active', 'archived'], default: 'active' })
  status: 'active' | 'archived';

  // created_at, updated_at, deleted_at hérités de BaseEntity → pas de redéclaration
  // Alias pour la compatibilité avec le code existant qui utilise createdAt/updatedAt
  get createdAt(): Date { return this.created_at; }
  get updatedAt(): Date { return this.updated_at; }

  @OneToMany(() => ConversationMessage, message => message.conversation)
  messages: ConversationMessage[];
}