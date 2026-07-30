// src/modules/notification/entities/notification.entity.ts
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  Index,
  OneToMany
} from 'typeorm';
import { User } from '../../iam/user/entities/user.entity';
import { NotificationPriority, NotificationType } from '../enum/notification-type.enum';
import { UserNotification } from './user-notification.entity';
import { TenantEntity } from 'src/core/entities/tenant.entity';

@Entity('notifications')
@Index(['user_id', 'read_at'])
@Index(['user_id', 'created_at'])
export class Notification extends TenantEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', name: 'user_id', nullable: true })
  @Index()
  user_id: number | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'varchar', length: 50 })
  type: NotificationType;

  @Column({ type: 'text' })
  title: string;

  @Column({ type: 'text', nullable: true })
  content: string;

  @Column({ type: 'json', nullable: true })
  data: any;

  @Column({ type: 'text', nullable: true })
  link: string;

  @Column({ type: 'varchar', length: 20, default: NotificationPriority.NORMAL })
  priority: NotificationPriority;

  @Column({ type: 'timestamp', nullable: true })
  read_at?: Date | null;

  @Column({ type: 'boolean', default: false })
  is_read: boolean;


  @Column({ type: 'boolean', default: false })
  is_archived: boolean;

  @Column({ type: 'boolean', default: true })
  is_push_sent: boolean;

  @Column({ type: 'text', nullable: true })
  image_url: string;

  @Column({ type: 'json', nullable: true })
  actions: any[];

    @OneToMany(() => UserNotification, userNotification => userNotification.notification)
  userNotifications: UserNotification[];
}
