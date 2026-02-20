// src/modules/notification/notification.service.ts
import { forwardRef, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, LessThan, DataSource } from 'typeorm';
import { Notification } from './entities/notification.entity';
import { UserNotification } from './entities/user-notification.entity';
import { CreateNotificationDto, CreateBulkNotificationDto } from './dto/create-notification.dto';
import { plainToInstance } from 'class-transformer';
import { User } from '../iam/user/entities/user.entity';
import { NotificationResponseDto } from './dto/notification-response.dto';
import { DossiersService } from '../dossiers/dossiers.service';
import { UsersService } from '../iam/user/user.service';
import { NotificationType } from './enum/notification-type.enum';

@Injectable()
export class NotificationService {
  private logger = new Logger('NotificationService');

  constructor(
    @InjectRepository(Notification)
    private notificationRepository: Repository<Notification>,
    @InjectRepository(UserNotification)
    private userNotificationRepository: Repository<UserNotification>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private userService: UsersService,
    @Inject(forwardRef(() => DossiersService))
    private dossierService: DossiersService,
    private dataSource: DataSource
  ) {console.log(forwardRef)}

  // Créer une notification pour un utilisateur
  async create(createNotificationDto: CreateNotificationDto): Promise<NotificationResponseDto> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Créer la notification principale
      const notification = this.notificationRepository.create({
        type: createNotificationDto.type as Notification['type'],
        title: createNotificationDto.title,
        content: createNotificationDto.content,
        data: createNotificationDto.data,
        link: createNotificationDto.link,
        priority: (createNotificationDto.priority ?? 'NORMAL') as Notification['priority'],
        image_url: createNotificationDto.image_url,
        actions: createNotificationDto.actions ?? []
      });

      const savedNotification = await queryRunner.manager.save(notification);

      // 2. Créer l'entrée dans la table pivot
      // const userNotification = this.userNotificationRepository.create({
      //   user_id: createNotificationDto.user_id,
      //   notification_id: savedNotification.id,
      //   is_read: false,
      //   is_push_sent: createNotificationDto.is_push_sent ?? true
      // });

      // const savedUserNotification = await queryRunner.manager.save(userNotification);

      await queryRunner.commitTransaction();

      // 3. Envoyer en temps réel
      const responseDto = plainToInstance(NotificationResponseDto, {
        ...savedNotification,
        // userNotificationId: savedUserNotification.id,
        is_read: false,
        read_at: null
      });


      this.logger.log(`✅ Notification créée pour l'utilisateur ${createNotificationDto.user_id}`);

      return responseDto;

    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error('❌ Erreur création notification:', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  // Créer une notification pour plusieurs utilisateurs (version optimisée)
  async createBulk(createBulkDto: CreateBulkNotificationDto, senderId: number): Promise<NotificationResponseDto[]> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Créer une seule notification pour tous
      const notification = this.notificationRepository.create({
        type: createBulkDto.type as Notification['type'],
        title: createBulkDto.title,
        content: createBulkDto.content,
        data: createBulkDto.data,
        link: createBulkDto.link,
        priority: (createBulkDto.priority ?? 'NORMAL') as Notification['priority'],
        image_url: createBulkDto.image_url,
        actions: createBulkDto.actions ?? [],
        user_id: senderId
      });
      console.log('Creating bulk notification with data:', createBulkDto.user_ids);

      const savedNotification = await queryRunner.manager.save(notification);

      // 2. Créer les entrées dans la table pivot pour tous les utilisateurs
      const userNotifications = createBulkDto.user_ids.map(userId => 
        this.userNotificationRepository.create({
          user_id: userId,
          notification_id: savedNotification.id,
          is_read: false,
          is_push_sent: true
        })
      );

      const savedUserNotifications = await queryRunner.manager.save(userNotifications);

      await queryRunner.commitTransaction();

      // 3. Envoyer en temps réel à chaque utilisateur
      const responseDtos = savedUserNotifications.map(userNotif => 
        plainToInstance(NotificationResponseDto, {
          ...savedNotification,
          userNotificationId: userNotif.id,
          is_read: false,
          read_at: null
        })
      );

      // Envoyer à chaque utilisateur
 

      this.logger.log(`✅ Notifications créées pour ${createBulkDto.user_ids.length} utilisateurs`);

      return responseDtos;

    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error('❌ Erreur création bulk notifications:', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  // Version simplifiée pour créer des notifications en bulk (si vous avez déjà plusieurs notifications)
  async createMany(createNotificationDtos: CreateNotificationDto[]): Promise<NotificationResponseDto[]> {
    // Grouper par contenu de notification pour optimiser
    const groupedByContent = new Map<string, {
      dto: CreateNotificationDto;
      userIds: number[];
    }>();

    for (const dto of createNotificationDtos) {
      const key = `${dto.type}_${dto.title}_${dto.content}`;
      if (!groupedByContent.has(key)) {
        groupedByContent.set(key, {
          dto,
          userIds: []
        });
      }
      groupedByContent.get(key)?.userIds.push(dto.user_id);
    }

    // Créer les notifications groupées
    const results: NotificationResponseDto[] = [];
    
    for (const [_, group] of groupedByContent) {
      const bulkResult = await this.createBulk({
        user_ids: group.userIds,
        type: group.dto.type,
        title: group.dto.title,
        content: group.dto.content,
        data: group.dto.data,
        link: group.dto.link,
        priority: group.dto.priority,
        actions: group.dto.actions,
        image_url: group.dto.image_url
      }, 1);
      results.push(...bulkResult);
    }

    return results;
  }

  // Récupérer les notifications d'un utilisateur
  async getUserNotifications(
    userId: number,
    page: number = 1,
    limit: number = 20,
    unreadOnly: boolean = false
  ): Promise<{ data: NotificationResponseDto[]; total: number; unread_count: number }> {
    const queryBuilder = this.userNotificationRepository
      .createQueryBuilder('userNotification')
      .leftJoinAndSelect('userNotification.notification', 'notification')
      .where('userNotification.user_id = :userId', { userId })
      .orderBy('userNotification.created_at', 'DESC');

    if (unreadOnly) {
      queryBuilder.andWhere('userNotification.is_read = :isRead', { isRead: false });
    }

    // Pagination
    queryBuilder
      .skip((page - 1) * limit)
      .take(limit);

    const [userNotifications, total] = await queryBuilder.getManyAndCount();

    // Compter les non lues
    const unread_count = await this.countUnread(userId);

    // Transformer en DTO
    const data = userNotifications.map(un => 
      plainToInstance(NotificationResponseDto, {
        ...un.notification,
        userNotificationId: un.id,
        is_read: un.is_read,
        read_at: un.read_at,
        created_at: un.created_at // Utiliser la date de la table pivot pour l'ordre
      })
    );

    return { data, total, unread_count };
  }

  // Récupérer les notifications non lues
  async getUnreadNotifications(userId: number): Promise<NotificationResponseDto[]> {
    const userNotifications = await this.userNotificationRepository.find({
      where: { user_id: userId, is_read: false },
      relations: ['notification'],
      order: { created_at: 'DESC' },
      take: 50
    });

    return userNotifications.map(un => 
      plainToInstance(NotificationResponseDto, {
        ...un.notification,
        userNotificationId: un.id,
        is_read: un.is_read,
        read_at: un.read_at,
        created_at: un.created_at
      })
    );
  }

  // Compter les notifications non lues
  async countUnread(userId: number): Promise<number> {
    return this.userNotificationRepository.count({
      where: { user_id: userId, is_read: false }
    });
  }

  // Marquer comme lue
  async markAsRead(notificationIds: number[], userId: number): Promise<void> {
    // notificationIds ici sont les IDs de la table user_notifications
    await this.userNotificationRepository.update(
      { id: In(notificationIds), user_id: userId },
      { is_read: true, read_at: new Date() }
    );

    // Mettre à jour le compteur en temps réel
    const unreadCount = await this.countUnread(userId);
    // this.mainGateway.sendToUser(userId, 'unread_count', { count: unreadCount });
  }

  // Marquer tout comme lu
  async markAllAsRead(userId: number): Promise<void> {
    await this.userNotificationRepository.update(
      { user_id: userId, is_read: false },
      { is_read: true, read_at: new Date() }
    );

    // this.mainGateway.sendToUser(userId, 'unread_count', { count: 0 });
  }

  // Archiver une notification
  async archive(userNotificationId: number, userId: number): Promise<void> {
    const result = await this.userNotificationRepository.update(
      { id: userNotificationId, user_id: userId },
      { is_archived: true }
    );

    if (result.affected === 0) {
      throw new NotFoundException('Notification non trouvée');
    }
  }

  // Supprimer une notification (soft delete ou hard delete selon besoin)
  async remove(userNotificationId: number, userId: number): Promise<void> {
    const result = await this.userNotificationRepository.delete({ 
      id: userNotificationId, 
      user_id: userId 
    });
    
    if (result.affected === 0) {
      throw new NotFoundException('Notification non trouvée');
    }

    // Optionnel: nettoyer les notifications orphelines
    await this.cleanupOrphanNotifications();
  }

  // Nettoyer les vieilles notifications
  async cleanupOldNotifications(daysOld: number = 30): Promise<any> {
    const date = new Date();
    date.setDate(date.getDate() - daysOld);

    // Supprimer les entrées de la table pivot
    const result = await this.userNotificationRepository.delete({
      created_at: LessThan(date),
      is_read: true,
      is_archived: true
    });

    // Nettoyer les notifications orphelines
    await this.cleanupOrphanNotifications();

    this.logger.log(`🧹 Nettoyage: ${result.affected} notifications supprimées`);
    return result.affected;
  }

  // Nettoyer les notifications sans utilisateurs associés
  private async cleanupOrphanNotifications(): Promise<void> {
    await this.notificationRepository
      .createQueryBuilder()
      .delete()
      .where('id NOT IN (SELECT DISTINCT notification_id FROM user_notifications)')
      .execute();
  }

  // Récupérer les statistiques
  async getNotificationStats(userId: number, days: number = 7): Promise<any> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const stats = await this.userNotificationRepository
      .createQueryBuilder('userNotification')
      .leftJoin('userNotification.notification', 'notification')
      .select('notification.type', 'type')
      .addSelect('COUNT(userNotification.id)', 'count')
      .where('userNotification.user_id = :userId', { userId })
      .andWhere('userNotification.created_at >= :startDate', { startDate })
      .groupBy('notification.type')
      .getRawMany();

    const total = stats.reduce((acc, curr) => acc + parseInt(curr.count), 0);
    const unread = await this.countUnread(userId);

    return {
      total,
      by_type: stats,
      unread
    };
  }

  // Méthodes spécifiques pour différents types de notifications
  async sendMessageNotification(message: any, senderId: number): Promise<void> {
    const recipients = message.conversation.participants
      .filter(p => p.id !== senderId)
      .map(p => p.id);

    if (recipients.length === 0) return;

    await this.createBulk({
      user_ids: recipients,
      type: NotificationType.MESSAGE,
      title: 'Nouveau message',
      content: `${message.sender_name}: ${message.content.substring(0, 100)}${message.content.length > 100 ? '...' : ''}`,
      data: {
        conversationId: message.conversation_id,
        messageId: message.id,
        senderId: message.sender_id,
        senderName: message.sender_name
      },
      link: `/chat/${message.conversation_id}`,
      priority: 'NORMAL'
    }, senderId);
  }

  async sendDossierStatusNotification(dossier: any, oldStatus: string, userIds: number[]): Promise<void> {
    await this.createBulk({
      user_ids: userIds,
      type: NotificationType.DOSSIER_STATUS_CHANGED,
      title: 'Changement de statut',
      content: `Le dossier ${dossier.dossier_number} est passé de "${oldStatus}" à "${dossier.status}"`,
      data: {
        dossierId: dossier.id,
        dossierNumber: dossier.dossier_number,
        oldStatus,
        newStatus: dossier.status
      },
      link: `/dossiers/${dossier.id}`,
      priority: 'NORMAL'
    }, 1);
  }

  async sendAudienceReminder(audience: any): Promise<void> {
    const userIds = [
      audience.lawyer_id,
      audience.client_id,
      ...(audience.collaborator_ids || [])
    ].filter(Boolean);

    await this.createBulk({
      user_ids: userIds,
      type: NotificationType.AUDIENCE_REMINDER,
      title: 'Rappel d\'audience',
      content: `Audience pour le dossier ${audience.dossier_number} prévue le ${new Date(audience.date).toLocaleDateString('fr-FR')} à ${audience.time}`,
      data: {
        audienceId: audience.id,
        dossierId: audience.dossier_id,
        dossierNumber: audience.dossier_number,
        date: audience.date,
        time: audience.time
      },
      link: `/audiences/${audience.id}`,
      priority: 'HIGH'
    }, 1);
  }

  // Récupérer les rooms de dossiers pour un utilisateur
  async getUserDossierRooms(userId: number): Promise<number[]> {
    const dossiers = await this.dossierService.getCollaboratorDossiers(userId);
    return dossiers.map(d => d.id);
  }
}