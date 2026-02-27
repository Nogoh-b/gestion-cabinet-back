// src/chat/entities/message.entity.ts
import { Employee } from 'src/modules/agencies/employee/entities/employee.entity';
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, OneToMany } from 'typeorm';

import { Conversation } from './conversation.entity';
import { Expose } from 'class-transformer';
import { MessageRead } from './message-read.entity';
import { Attachment } from './attachment.entity';


@Entity()
export class Message {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('text')
  content: string;

  @ManyToOne(() => Employee)
  sender: Employee; 

  @ManyToOne(() => Conversation, conversation => conversation.messages, {
    eager: true,
  })
  conversation: Conversation;


  // Nouvelle relation avec les attachments
  @OneToMany(() => Attachment, attachment => attachment.message, {
    cascade: true,
    eager: true, // Charge automatiquement les pièces jointes avec le message
  })
  attachments: Attachment[];

  @Column({ default: false })
  hasAttachments: boolean; // Pour faciliter les recherches


  @OneToMany(() => MessageRead, read => read.message)
  reads: MessageRead[];


  @CreateDateColumn()
  createdAt: Date;

  @Expose()
  get isRead(): boolean {
    if (!this.reads || this.reads.length === 0) {
      return false;
    }

    return this.reads.every(r => r.isRead === true);
  }

  @Expose()
   get sender_name(): string {
    return this.sender.user?.full_name || '';
  }

  
  // Nouveaux champs exposés pour les attachments
  @Expose()
  get attachmentsCount(): number {
    return this.attachments?.length || 0;
  }

  @Expose()
  get hasImages(): boolean {
    return this.attachments?.some(a => a.fileType === 'image') || false;
  }

  @Expose()
  get hasDocuments(): boolean {
    return this.attachments?.some(a => a.fileType === 'document') || false;
  }

  // Méthode utilitaire pour vérifier si le message est vide (pas de contenu et pas de pièces jointes)
  @Expose()
  get isEmpty(): boolean {
    return !this.content && (!this.attachments || this.attachments.length === 0);
  }
}