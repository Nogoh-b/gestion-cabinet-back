// src/chat/entities/message.entity.ts
import { Employee } from 'src/modules/agencies/employee/entities/employee.entity';
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne } from 'typeorm';

import { Conversation } from './conversation.entity';


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


  @Column({ default: false })
  isRead: boolean;

  @CreateDateColumn()
  createdAt: Date;
}