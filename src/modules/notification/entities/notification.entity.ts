import {
  BusinessColumn,
  BusinessTable,
} from 'src/core/decorators/business-metadata.decorator';
// src/modules/notification/entities/notification.entity.ts
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  Index,
  OneToMany,
} from 'typeorm';
import { User } from '../../iam/user/entities/user.entity';
import {
  NotificationPriority,
  NotificationType,
} from '../enum/notification-type.enum';
import { UserNotification } from './user-notification.entity';
import { TenantEntity } from 'src/core/entities/tenant.entity';

@Entity('notifications')
@Index(['user_id', 'read_at'])
@Index(['user_id', 'created_at'])
// Lecture seule, limitée au destinataire connecté (user_id, voir ai-scoped-tables.ts).
@BusinessTable({
  label: 'Mes notifications',
  description:
    "Notifications reçues par l'utilisateur connecté : titre, contenu, type, priorité, lue ou non (is_read), date (created_at).",
  category: 'utilisateur',
  readOnly: true,
})
export class Notification extends TenantEntity {
  @PrimaryGeneratedColumn()
  @BusinessColumn({
    label: 'Identifiant',
    description: 'Non exposé',
    importance: 'low',
    ignored: true,
  })
  id: number;

  @Column({ type: 'int', name: 'user_id' })
  @Index()
  @BusinessColumn({
    label: 'Destinataire',
    description: 'Non exposé',
    importance: 'low',
    ignored: true,
  })
  user_id: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'varchar', length: 50 })
  type: NotificationType;

  @Column({ type: 'text' })
  @BusinessColumn({
    label: 'Titre',
    description: 'Titre de la notification',
    importance: 'critical',
  })
  title: string;

  @Column({ type: 'text', nullable: true })
  @BusinessColumn({ label: 'Contenu', description: 'Texte de la notification' })
  content: string;

  @Column({ type: 'json', nullable: true })
  @BusinessColumn({
    label: 'Données',
    description: 'Non exposé',
    importance: 'low',
    ignored: true,
  })
  data: any;

  @Column({ type: 'text', nullable: true })
  @BusinessColumn({
    label: 'Lien',
    description: 'Non exposé',
    importance: 'low',
    ignored: true,
  })
  link: string;

  @Column({ type: 'varchar', length: 20, default: NotificationPriority.NORMAL })
  priority: NotificationPriority;

  @Column({ type: 'timestamp', nullable: true })
  read_at?: Date | null;

  @Column({ type: 'boolean', default: false })
  @BusinessColumn({
    label: 'Lue',
    description: 'Vrai si la notification a été lue',
  })
  is_read: boolean;

  @Column({ type: 'boolean', default: false })
  @BusinessColumn({
    label: 'Archivée',
    description: 'Vrai si la notification est archivée',
  })
  is_archived: boolean;

  @Column({ type: 'boolean', default: true })
  @BusinessColumn({
    label: 'Envoyée en push',
    description: 'Non exposé',
    importance: 'low',
    ignored: true,
  })
  is_push_sent: boolean;

  @Column({ type: 'text', nullable: true })
  @BusinessColumn({
    label: 'Image',
    description: 'Non exposé',
    importance: 'low',
    ignored: true,
  })
  image_url: string;

  @Column({ type: 'json', nullable: true })
  @BusinessColumn({
    label: 'Actions',
    description: 'Non exposé',
    importance: 'low',
    ignored: true,
  })
  actions: any[];

  @OneToMany(
    () => UserNotification,
    (userNotification) => userNotification.notification,
  )
  userNotifications: UserNotification[];
}
