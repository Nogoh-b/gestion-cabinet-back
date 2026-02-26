// src/chat/entities/message.entity.ts
import { Employee } from 'src/modules/agencies/employee/entities/employee.entity';
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne } from 'typeorm';

import { Message } from './messages.entity';


// message-read.entity.ts

@Entity()
export class MessageRead {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Message, message => message.reads, {
    onDelete: 'CASCADE',
  })
  message: Message;

  @ManyToOne(() => Employee, {
    onDelete: 'CASCADE',
  })
  reader: Employee;

  @Column({ default: false })
  isRead: boolean;

  @CreateDateColumn()
  readAt: Date;

  get messageId(): number {
    return this.message?.id;
  }

  // Getter pour l'ID du lecteur
  get readerId(): number {
    return this.reader?.id;
  }
}
