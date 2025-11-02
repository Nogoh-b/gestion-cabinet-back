// src/notifications/notifications.service.ts
import { Repository } from 'typeorm';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';



import { Employee } from '../agencies/employee/entities/employee.entity';
import { MessageResponseDto } from '../chat/dto/message-response.dto';




export interface NotificationPayload {
  title: string;
  body: string;
  data?: any;
  userId: number;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(Employee)
    private userRepository: Repository<Employee>,
  ) {}

  /**
   * Envoie une notification push pour un nouveau message
   */
  async sendMessageNotification(message: MessageResponseDto, excludedUserId?: number): Promise<void> {
    const conversation = message.conversation;
    
    // Récupérer tous les participants sauf l'expéditeur
    const recipients = conversation.participants.filter(
      participant => participant.id !== message.sender.id && 
                   participant.id !== excludedUserId
    );

    for (const recipient of recipients) {
      const payload: NotificationPayload = {
        title: message.sender.full_name,
        body: this.truncateMessage(message.content),
        data: {
          type: 'NEW_MESSAGE',
          conversationId: conversation.id,
          messageId: message.id,
          senderId: message.sender.id,
        },
        userId: recipient.id,
      };

      await this.sendPushNotification(payload);
      await this.sendEmailNotification(recipient.email, payload);
    }
  }

  /**
   * Envoie une notification pour un nouvel utilisateur ajouté à un groupe
   */
  async sendGroupInvitationNotification(
    groupName: string, 
    addedUserIds: number[], 
    addedByUserId: number
  ): Promise<void> {
    const addedByUser = await this.userRepository.findOne({ where: { id: addedByUserId } });
    
    for (const userId of addedUserIds) {
      const payload: NotificationPayload = {
        title: 'Nouveau groupe',
        body: `${addedByUser?.full_name} vous a ajouté au groupe "${groupName}"`,
        data: {
          type: 'GROUP_INVITATION',
          groupName,
          addedByUserId,
        },
        userId,
      };

      await this.sendPushNotification(payload);
    }
  }

  /**
   * Notification de présence utilisateur
   */
  async sendUserStatusNotification(userId: number, isOnline: boolean): Promise<void> {
    // Implémentez selon vos besoins
    this.logger.log(`User ${userId} is ${isOnline ? 'online' : 'offline'}`);
  }

  /**
   * Notification push (exemple avec FCM - Firebase Cloud Messaging)
   */
  private async sendPushNotification(payload: NotificationPayload): Promise<void> {
    try {
      // Exemple avec Firebase Admin SDK
      // const messaging = getMessaging();
      
      // Récupérer le token FCM de l'utilisateur depuis la base de données
      const user = await this.userRepository.findOne({ 
        where: { id: payload.userId },
        select: ['user'] // Ajoutez cette colonne à votre entité User
      });

      if (user && user.user && user.user.fcmToken) {
        const message = { 
          token: user.user.fcmToken,
          notification: {
            title: payload.title,
            body: payload.body,
          },
          data: payload.data,
        };

        // await messaging.send(message);
        this.logger.log(`Push notification sent to user ${payload.userId}`);
      }
    } catch (error) {
      this.logger.error(`Failed to send push notification: ${error.message}`);
    }
  }

  /**
   * Notification email
   */
  private async sendEmailNotification(email: string, payload: NotificationPayload): Promise<void> {
    // Implémentez avec Nodemailer ou un service d'email
    this.logger.log(`Email notification sent to ${email}: ${payload.title} - ${payload.body}`);
  }

  private truncateMessage(content: string, maxLength: number = 100): string {
    return content.length > maxLength ? content.substring(0, maxLength) + '...' : content;
  }
}