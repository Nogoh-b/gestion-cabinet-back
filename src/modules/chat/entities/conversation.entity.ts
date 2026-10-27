// src/chat/entities/conversation.entity.ts
import { Employee } from 'src/modules/agencies/employee/entities/employee.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
  ManyToMany,
  JoinTable,
  OneToOne,
} from 'typeorm';

import { Message } from './messages.entity';
import { Dossier } from 'src/modules/dossiers/entities/dossier.entity';
import { Expose } from 'class-transformer';

import { TenantEntity as BaseEntity } from 'src/core/entities/tenant.entity';

/**
 * Nature d'une conversation, utilisée par le front pour classer la liste :
 *  - global  : groupe de tout le cabinet (`cabinet.default_chat_group_name`) ;
 *  - dossier : chat réservé aux membres d'un dossier ;
 *  - direct  : discussion entre deux collaborateurs ;
 *  - group   : groupe libre créé par un utilisateur.
 */
export enum ConversationType {
  GLOBAL = 'global',
  DOSSIER = 'dossier',
  DIRECT = 'direct',
  GROUP = 'group',
}

@Entity()
export class Conversation extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true })
  name: string; // Pour les groupes

  @Column({ default: false })
  isGroup: boolean;

  @Column({
    type: 'enum',
    enum: ConversationType,
    default: ConversationType.GROUP,
  })
  type: ConversationType;

  @ManyToMany(() => Employee, {
    eager: false,
  })
  @JoinTable()
  participants: Employee[];

  @OneToMany(() => Message, (message) => message.conversation)
  messages: Message[];

  @OneToOne(() => Dossier, (dossier) => dossier.conversation)
  dossier: Dossier;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ default: null })
  lastMessageAt: Date;

  // ✅ AJOUTER CETTE COLONNE
  @Column({ type: 'json', nullable: true })
  lastMessageData?: {
    content: string;
    createdAt: string;
    senderId: number;
    senderName: string;
    readCount?: number;
    hasAttachments?: boolean;
    attachmentsCount?: number;
    attachmentsTypes?: string[];
    attachmentIds?: number[];
    referencesCount?: number;
    messageId?: number;
    status?: 'sent' | 'delivered' | 'read';
  };

  // ✅ GARDER LE GETTER POUR LA COMPATIBILITÉ
  @Expose()
  get lastMessage():
    | {
        content: string;
        createdAt: string;
        senderId: number;
        senderName: string;
      }
    | undefined {
    return this.lastMessageData;
  }
}
