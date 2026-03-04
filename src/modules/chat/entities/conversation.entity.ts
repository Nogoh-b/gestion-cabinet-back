// src/chat/entities/conversation.entity.ts
import { Employee } from 'src/modules/agencies/employee/entities/employee.entity';
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, OneToMany, ManyToMany, JoinTable, OneToOne } from 'typeorm';

import { Message } from './messages.entity';
import { Dossier } from 'src/modules/dossiers/entities/dossier.entity';
import { Expose } from 'class-transformer';



@Entity()
export class Conversation {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true })
  name: string; // Pour les groupes

  @Column({ default: false })
  isGroup: boolean;

  @ManyToMany(() => Employee, {
    eager: true,
  })
  @JoinTable()
  participants: Employee[];

  @OneToMany(() => Message, message => message.conversation)
  messages: Message[];

  @OneToOne(() => Dossier, dossier => dossier.conversation)
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
  };

  // ✅ GARDER LE GETTER POUR LA COMPATIBILITÉ
  @Expose()
  get lastMessage(): {
    content: string;
    createdAt: string;
    senderId: number;
    senderName: string;
  } | undefined {
    return this.lastMessageData;
  }
}