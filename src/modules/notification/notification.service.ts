// src/modules/notification/notification.service.ts
import { forwardRef, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, FindOptionsWhere, LessThan } from 'typeorm';
import { Notification } from './entities/notification.entity';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { plainToInstance } from 'class-transformer';
import { User } from '../iam/user/entities/user.entity';
import { NotificationPriority, NotificationType } from './enum/notification-type.enum';
import { NotificationGateway } from './gateways/notification.gateway';
import { NotificationResponseDto } from './dto/notification-response.dto';
import { Socket } from 'socket.io';
import { DossiersService } from '../dossiers/dossiers.service';

@Injectable()
export class NotificationService {
  private logger = new Logger('NotificationService');

  constructor(
    @InjectRepository(Notification)
    private notificationRepository: Repository<Notification>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private notificationGateway: NotificationGateway,
    @Inject(forwardRef(() => DossiersService))
    private dossierService: DossiersService
  ) {
    console.log(forwardRef)

  }

  // Créer une notification
  async create(createNotificationDto: CreateNotificationDto): Promise<NotificationResponseDto> {
    const notification = this.notificationRepository.create({
      ...createNotificationDto,
      is_read: false,
      read_at: null
    });

    const savedNotification = await this.notificationRepository.save(notification);
    
    // Envoyer en temps réel via WebSocket
    await this.notificationGateway.sendToUser(
      createNotificationDto.user_id,
      'new_notification',
      plainToInstance(NotificationResponseDto, savedNotification)
    );

    this.logger.log(`✅ Notification créée pour l'utilisateur ${createNotificationDto.user_id}`);

    return plainToInstance(NotificationResponseDto, savedNotification);
  }

  // Créer une notification pour plusieurs utilisateurs
  async createBulk(createNotificationDtos: CreateNotificationDto[]): Promise<NotificationResponseDto[]> {
    const notifications = this.notificationRepository.create(
      createNotificationDtos.map(dto => ({
        ...dto,
        is_read: false,
        read_at: null
      }))
    );

    const savedNotifications = await this.notificationRepository.save(notifications);

    // Envoyer chaque notification à son destinataire
    savedNotifications.forEach(notification => {
      this.notificationGateway.sendToUser(
        notification.user_id,
        'new_notification',
        plainToInstance(NotificationResponseDto, notification)
      );
    });

    return plainToInstance(NotificationResponseDto, savedNotifications);
  }

  // Récupérer les notifications d'un utilisateur
  async getUserNotifications(
    userId: number,
    page: number = 1,
    limit: number = 20,
    unreadOnly: boolean = false
  ): Promise<{ data: NotificationResponseDto[]; total: number; unread_count: number }> {
    const where: FindOptionsWhere<Notification> = { user_id: userId };
    
    if (unreadOnly) {
      where.is_read = false;
    }

    const [notifications, total] = await this.notificationRepository.findAndCount({
      where,
      order: { created_at: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
      relations: ['user']
    });

    const unread_count = await this.countUnread(userId);

    const data = plainToInstance(NotificationResponseDto, notifications);

    return { data, total, unread_count };
  }

  // Récupérer les notifications non lues
  async getUnreadNotifications(userId: number): Promise<NotificationResponseDto[]> {
    const notifications = await this.notificationRepository.find({
      where: { user_id: userId, is_read: false },
      order: { created_at: 'DESC' },
      take: 50
    });

    return plainToInstance(NotificationResponseDto, notifications);
  }

  // Compter les notifications non lues
  async countUnread(userId: number): Promise<number> {
    return this.notificationRepository.count({
      where: { user_id: userId, is_read: false }
    });
  }

  // Marquer comme lue
  async markAsRead(notificationIds: number[], userId: number): Promise<void> {
    await this.notificationRepository.update(
      { id: In(notificationIds), user_id: userId },
      { is_read: true, read_at: new Date() }
    );

    // Mettre à jour le compteur en temps réel
    const unreadCount = await this.countUnread(userId);
    this.notificationGateway.sendToUser(userId, 'unread_count', { count: unreadCount });
  }

  // Marquer tout comme lu
  async markAllAsRead(userId: number): Promise<void> {
    await this.notificationRepository.update(
      { user_id: userId, is_read: false },
      { is_read: true, read_at: new Date() }
    );

    this.notificationGateway.sendToUser(userId, 'unread_count', { count: 0 });
  }

  // Archiver une notification
  async archive(notificationId: number, userId: number): Promise<void> {
    const notification = await this.notificationRepository.findOne({
      where: { id: notificationId, user_id: userId }
    });

    if (!notification) {
      throw new NotFoundException('Notification non trouvée');
    }

    notification.is_archived = true;
    await this.notificationRepository.save(notification);
  }

  // Supprimer une notification
  async remove(notificationId: number, userId: number): Promise<void> {
    const result = await this.notificationRepository.delete({ id: notificationId, user_id: userId });
    
    if (result.affected === 0) {
      throw new NotFoundException('Notification non trouvée');
    }
  }

  // Nettoyer les vieilles notifications
  async cleanupOldNotifications(daysOld: number = 30): Promise<any> {
    const date = new Date();
    date.setDate(date.getDate() - daysOld);

    const result = await this.notificationRepository.delete({
      created_at: LessThan(date),
      is_read: true
    });

    this.logger.log(`🧹 Nettoyage: ${result.affected} notifications supprimées`);
    return result.affected;
  }

  // Méthodes spécifiques pour différents types de notifications
  async sendMessageNotification(message: any, senderId: number): Promise<void> {
    // Récupérer les destinataires (sauf l'expéditeur)
    const recipients = message.conversation.participants
      .filter(p => p.id !== senderId)
      .map(p => p.id);

    if (recipients.length === 0) return;

    const notificationDtos: CreateNotificationDto[] = recipients.map(userId => ({
      user_id: userId,
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
      priority: NotificationPriority.NORMAL
    }));

    await this.createBulk(notificationDtos);
  }

  async sendDossierStatusNotification(dossier: any, oldStatus: string, userIds: number[]): Promise<void> {
    const notificationDtos: CreateNotificationDto[] = userIds.map(userId => ({
      user_id: userId,
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
      priority: NotificationPriority.NORMAL
    }));

    await this.createBulk(notificationDtos);
  }

  async sendAudienceReminder(audience: any): Promise<void> {
    // Récupérer les personnes concernées
    const userIds = [
      audience.lawyer_id,
      audience.client_id,
      ...(audience.collaborator_ids || [])
    ].filter(Boolean);

    const notificationDtos: CreateNotificationDto[] = userIds.map(userId => ({
      user_id: userId,
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
      priority: NotificationPriority.HIGH
    }));

    await this.createBulk(notificationDtos);
  }

  async sendFactureOverdueReminders(): Promise<void> {
    // Logique pour envoyer des rappels de factures impayées
    // À implémenter selon votre logique métier
  }

  // Récupérer les rooms de dossiers pour un utilisateur
  async getUserDossierRooms(userId: number): Promise<number[]> {
    // Cette méthode dépend de votre structure de données
    // Exemple avec une requête personnalisée
    // const result = await this.notificationRepository.query(`
    //   SELECT DISTINCT d.id 
    //   FROM dossiers d
    //   LEFT JOIN dossier_collaborators dc ON d.id = dc.dossier_id
    //   WHERE d.lawyer_id = $1 OR dc.user_id = $1
    // `, [userId]);

    const dossiers = await this.dossierService.getCollaboratorDossiers(userId)

    return dossiers.map(r => r.id);
  }

  // Statistiques
  async getNotificationStats(userId: number, days: number = 7): Promise<any> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const stats = await this.notificationRepository
      .createQueryBuilder('notification')
      .select('notification.type', 'type')
      .addSelect('COUNT(notification.id)', 'count')
      .where('notification.user_id = :userId', { userId })
      .andWhere('notification.created_at >= :startDate', { startDate })
      .groupBy('notification.type')
      .getRawMany();

    const total = stats.reduce((acc, curr) => acc + parseInt(curr.count), 0);

    return {
      total,
      by_type: stats,
      unread: await this.countUnread(userId)
    };
  }

  async initConnexion(client: Socket){
    this.notificationGateway.initConnexion(client)
  }

  async sendUserStatusNotification(userId: number, isOnline: boolean): Promise<void> {
    // Récupérer les utilisateurs qui doivent être notifiés
    // (par exemple, les collaborateurs, admins, etc.)
    
    this.notificationGateway.sendToAll('user_status_changed', {
      userId,
      status: isOnline ? 'online' : 'offline',
      timestamp: new Date().toISOString()
    });
  }
}