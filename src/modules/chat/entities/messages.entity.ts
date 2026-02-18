// src/chat/entities/message.entity.ts
import { Employee } from 'src/modules/agencies/employee/entities/employee.entity';
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, OneToMany } from 'typeorm';

import { Conversation } from './conversation.entity';
import { Expose } from 'class-transformer';
import { MessageRead } from './message-read.entity';


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
}