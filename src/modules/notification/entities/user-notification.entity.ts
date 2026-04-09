// src/modules/notification/entities/user-notification.entity.ts
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  Index,
  CreateDateColumn
} from 'typeorm';
import { User } from '../../iam/user/entities/user.entity';
import { Notification } from './notification.entity';

@Entity('user_notifications')
@Index(['user_id', 'is_read'])
@Index(['user_id', 'created_at'])
export class UserNotification {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', name: 'user_id' })
  @Index()
  user_id: number;

  @Column({ type: 'int', name: 'notification_id' })
  notification_id: number;

  @Column({ type: 'boolean', default: false })
  is_read: boolean;

  @Column({ type: 'timestamp', nullable: true })
  read_at?: Date | null;

  @Column({ type: 'boolean', default: false })
  is_archived: boolean;

  @Column({ type: 'boolean', default: true })
  is_push_sent: boolean;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  // Relations
  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Notification, { eager: true })
  @JoinColumn({ name: 'notification_id' })
  notification: Notification;
}