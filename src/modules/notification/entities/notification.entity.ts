// src/modules/notification/entities/notification.entity.ts
import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    CreateDateColumn,
    ManyToOne,
    JoinColumn,
    Index,
    OneToMany
} from 'typeorm';
import { User } from '../../iam/user/entities/user.entity';
import { NotificationPriority, NotificationType } from '../enum/notification-type.enum';
import { UserNotification } from './user-notification.entity';

@Entity('notifications')
@Index(['user_id', 'read_at'])
@Index(['user_id', 'created_at'])
export class Notification {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', name: 'user_id' })
  @Index()
  user_id: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'varchar', length: 50 })
  type: NotificationType;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text', nullable: true })
  content: string;

  @Column({ type: 'json', nullable: true })
  data: any;

  @Column({ type: 'varchar', length: 255, nullable: true })
  link: string;

  @Column({ type: 'varchar', length: 20, default: NotificationPriority.NORMAL })
  priority: NotificationPriority;

  @Column({ type: 'timestamp', nullable: true })
  read_at?: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @Column({ type: 'boolean', default: false })
  is_read: boolean;


  @Column({ type: 'boolean', default: false })
  is_archived: boolean;

  @Column({ type: 'boolean', default: true })
  is_push_sent: boolean;

  @Column({ type: 'varchar', length: 255, nullable: true })
  image_url: string;

  @Column({ type: 'json', nullable: true })
  actions: any[];

    @OneToMany(() => UserNotification, userNotification => userNotification.notification)
  userNotifications: UserNotification[];
}