// src/modules/customer/customer-communication/entities/customer-communication.entity.ts
import { BaseEntity } from 'src/core/entities/baseEntity';
import { Customer } from 'src/modules/customer/customer/entities/customer.entity';
import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';

export enum CommunicationType {
  EMAIL = 'email',
  PHONE = 'phone',
  MEETING = 'meeting',
  LETTER = 'letter'
}

export enum CommunicationStatus {
  SENT = 'sent',
  RECEIVED = 'received',
  PLANNED = 'planned',
  CANCELLED = 'cancelled'
}

@Entity('customer_communication')
export class CustomerCommunication extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Customer, (customer) => customer.communications)
  customer: Customer;

  @Column({ type: 'enum', enum: CommunicationType })
  type: CommunicationType;

  @Column()
  subject: string;

  @Column({ type: 'text', nullable: true })
  content: string;

  @Column({ type: 'timestamp' , nullable: false, default: () => 'CURRENT_TIMESTAMP'})
  date: Date | null;

  @Column({ type: 'enum', enum: CommunicationStatus, default: CommunicationStatus.SENT })
  status: CommunicationStatus;

  @Column({ nullable: true })
  duration: number; // en minutes pour les appels

  @Column({ nullable: true })
  participants: string; // participants à la communication

  
}