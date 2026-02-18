// src/chat/entities/conversation.entity.ts
import { Employee } from 'src/modules/agencies/employee/entities/employee.entity';
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, OneToMany, ManyToMany, JoinTable } from 'typeorm';

import { Message } from './messages.entity';


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

  @CreateDateColumn()
  createdAt: Date;

  @Column({ default: null })
  lastMessageAt: Date;
  
  @Column({ type: 'text', nullable: true })
  lastMessage: string;
}