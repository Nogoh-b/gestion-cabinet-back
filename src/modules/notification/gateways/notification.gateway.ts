// src/modules/notification/notification.gateway.ts
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { NotificationType } from '../enum/notification-type.enum';
import { NotificationService } from '../notification.service';

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
  namespace: 'notifications',
})
@Injectable()
export class NotificationGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private logger = new Logger('NotificationGateway');
  private userSockets: Map<number, Set<string>> = new Map();
  private userRooms: Map<number, Set<string>> = new Map();

  constructor(
      @Inject(forwardRef(() => NotificationService))
      private notificationService: NotificationService) { console.log(forwardRef) }

  async handleConnection(client: Socket) {
    this.initConnexion(client)
  }

  async initConnexion(client: Socket){
    const userId = client.handshake.auth.userId;
    const token = client.handshake.auth.token;
      console.log(`User1111111 ${userId} connected`);

    if (!userId) {
      this.logger.warn('Connexion refusée: userId manquant');
      client.disconnect();
      return;
    }

    try {
      // Valider le token (optionnel)
      // await this.validateToken(token);

      // Ajouter le socket à l'utilisateur
      if (!this.userSockets.has(userId)) {
        this.userSockets.set(userId, new Set());
      }
      this.userSockets.get(userId)?.add(client.id);

      // Joindre la room personnelle de l'utilisateur
      const userRoom = `user_${userId}`;
      client.join(userRoom);
      console.log(`✅ Socket ${client.id} a rejoint la room: ${userRoom}`);

      if (!this.userRooms.has(userId)) {
        this.userRooms.set(userId, new Set());
      }
      this.userRooms.get(userId)?.add(userRoom);

      this.logger.log(`🔌 Utilisateur ${userId} connecté - Socket: ${client.id}`);

      console.log(this.userRooms)

      // Envoyer les notifications non lues à la connexion
      const unreadNotifications = await this.notificationService.getUnreadNotifications(userId);
      if (unreadNotifications.length > 0) {
        client.emit('unread_notifications', {
          count: unreadNotifications.length,
          notifications: unreadNotifications
        });
      }

      // Notifier les autres utilisateurs que cet utilisateur est en ligne
      client.broadcast.emit('user_status_changed', {
        userId,
        status: 'online',
        timestamp: new Date().toISOString()
      });

      // Rejoindre les rooms des dossiers/canaux pertinents
      await this.joinUserRooms(client, userId);

    } catch (error) {
      this.logger.error(`Erreur de connexion: ${error.message}`);
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    const userId = this.findUserIdBySocketId(client.id);

    if (userId) {
      // Retirer le socket
      this.userSockets.get(userId)?.delete(client.id);
      
      // Si plus de sockets pour cet utilisateur
      if (this.userSockets.get(userId)?.size === 0) {
        this.userSockets.delete(userId);
        
        // Quitter les rooms
        const rooms = this.userRooms.get(userId);
        if (rooms) {
          rooms.forEach(room => client.leave(room));
          this.userRooms.delete(userId);
        }

        // Notifier que l'utilisateur est hors ligne
        this.server.emit('user_status_changed', {
          userId,
          status: 'offline',
          timestamp: new Date().toISOString()
        });

        this.logger.log(`🔌 Utilisateur ${userId} déconnecté (dernier socket)`);
      } else {
        this.logger.log(`🔌 Socket ${client.id} déconnecté pour utilisateur ${userId}`);
      }
    }
  }

  private async joinUserRooms(client: Socket, userId: number) {
    try {
      // Rejoindre les rooms des dossiers de l'utilisateur
      const userDossiers = await this.notificationService.getUserDossierRooms(userId);
      userDossiers.forEach(dossierId => {
        const room = `dossier_${dossierId}`;
        client.join(room);
        this.userRooms.get(userId)?.add(room);
      });

      // Rejoindre la room globale
      client.join('global');
      this.userRooms.get(userId)?.add('global');

    } catch (error) {
      this.logger.error(`Erreur lors du join des rooms: ${error.message}`);
    }
  }

  private findUserIdBySocketId(socketId: string): number | null {
    for (const [userId, sockets] of this.userSockets.entries()) {
      if (sockets.has(socketId)) {
        return userId;
      }
    }
    return null;
  }

  // Envoyer une notification à un utilisateur spécifique
  async sendToUser(userId: number, event: string, data: any) {
    const room = `user_${userId}`;
    this.server.to(room).emit(event, data);
    const roomSockets = await this.server.in(room).fetchSockets();
    console.log(`Nombre de clients dans la room ${room}:`, roomSockets.length);

    this.logger.debug(`📨 Notification envoyée à utilisateur ${userId}: ${event}`);
  }

  // Envoyer une notification à plusieurs utilisateurs
  async sendToUsers(userIds: number[], event: string, data: any) {
    userIds.forEach(userId => {
      this.sendToUser(userId, event, data);
    });
  }

  // Envoyer une notification à une room spécifique
  async sendToRoom(room: string, event: string, data: any) {
    this.server.to(room).emit(event, data);
    this.logger.debug(`📨 Notification envoyée à room ${room}: ${event}`);
  }

  // Envoyer à tous les utilisateurs connectés
  async sendToAll(event: string, data: any) {
    this.server.emit(event, data);
    this.logger.debug(`📨 Notification broadcast: ${event}`);
  }

  // Méthodes spécifiques pour différents types de notifications
  async sendNewMessageNotification(conversationId: number, message: any, recipientIds: number[]) {
    const notification = {
      type: NotificationType.MESSAGE,
      title: 'Nouveau message',
      content: `${message.sender_name}: ${message.content.substring(0, 50)}...`,
      data: {
        conversationId,
        messageId: message.id,
        senderId: message.sender_id,
        senderName: message.sender_name
      },
      link: `/chat/${conversationId}`,
      priority: 'normal',
      timestamp: new Date().toISOString()
    };

    // Envoyer aux destinataires
    recipientIds.forEach(userId => {
      this.sendToUser(userId, 'new_notification', notification);
    });

    // Émettre aussi sur la room de conversation
    this.sendToRoom(`conversation_${conversationId}`, 'conversation_activity', {
      type: 'new_message',
      message,
      notification
    });
  }

  async sendDossierUpdateNotification(dossierId: number, update: any, userIds: number[]) {
    const notification = {
      type: NotificationType.DOSSIER_UPDATED,
      title: 'Mise à jour de dossier',
      content: update.content,
      data: {
        dossierId,
        updateType: update.type,
        updatedBy: update.updated_by
      },
      link: `/dossiers/${dossierId}`,
      priority: 'normal',
      timestamp: new Date().toISOString()
    };

    // Envoyer aux utilisateurs concernés
    userIds.forEach(userId => {
      this.sendToUser(userId, 'new_notification', notification);
    });

    // Émettre sur la room du dossier
    this.sendToRoom(`dossier_${dossierId}`, 'dossier_activity', {
      type: 'update',
      update,
      notification
    });
  }

  async sendAudienceReminderNotification(audience: any, userIds: number[]) {
    const notification = {
      type: NotificationType.AUDIENCE_REMINDER,
      title: 'Rappel d\'audience',
      content: `Audience pour le dossier ${audience.dossier_number} demain à ${audience.time}`,
      data: {
        audienceId: audience.id,
        dossierId: audience.dossier_id,
        date: audience.date,
        time: audience.time
      },
      link: `/audiences/${audience.id}`,
      priority: 'high',
      timestamp: new Date().toISOString()
    };

    userIds.forEach(userId => {
      this.sendToUser(userId, 'new_notification', notification);
    });
  }

  async sendFactureNotification(facture: any, userIds: number[], type: NotificationType) {
    const titles = {
      [NotificationType.FACTURE_CREATED]: 'Nouvelle facture',
      [NotificationType.FACTURE_PAID]: 'Facture payée',
      [NotificationType.FACTURE_OVERDUE]: 'Facture en retard'
    };

    const notification = {
      type,
      title: titles[type],
      content: `Facture ${facture.numero} - ${facture.montant} €`,
      data: {
        factureId: facture.id,
        dossierId: facture.dossier_id,
        montant: facture.montant,
        numero: facture.numero
      },
      link: `/factures/${facture.id}`,
      priority: type === NotificationType.FACTURE_OVERDUE ? 'urgent' : 'normal',
      timestamp: new Date().toISOString()
    };

    userIds.forEach(userId => {
      this.sendToUser(userId, 'new_notification', notification);
    });
  }

  // Souscriptions pour des événements spécifiques
  @SubscribeMessage('subscribe_to_dossier')
  handleSubscribeToDossier(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { dossierId: number }
  ) {
    const room = `dossier_${data.dossierId}`;
    client.join(room);
    
    const userId = this.findUserIdBySocketId(client.id);
    if (userId) {
      this.userRooms.get(userId)?.add(room);
    }

    this.logger.log(`📌 Socket ${client.id} abonné au dossier ${data.dossierId}`);
    return { success: true, room };
  }

  @SubscribeMessage('unsubscribe_from_dossier')
  handleUnsubscribeFromDossier(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { dossierId: number }
  ) {
    const room = `dossier_${data.dossierId}`;
    client.leave(room);
    
    const userId = this.findUserIdBySocketId(client.id);
    if (userId) {
      this.userRooms.get(userId)?.delete(room);
    }

    this.logger.log(`📌 Socket ${client.id} désabonné du dossier ${data.dossierId}`);
    return { success: true };
  }

  @SubscribeMessage('mark_notifications_read')
  async handleMarkNotificationsRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { notification_ids?: number[]; mark_all?: boolean }
  ) {
    const userId = this.findUserIdBySocketId(client.id);
    if (!userId) return;

    if (data.mark_all) {
      await this.notificationService.markAllAsRead(userId);
    } else if (data.notification_ids) {
      await this.notificationService.markAsRead(data.notification_ids, userId);
    }

    // Confirmer à l'utilisateur
    client.emit('notifications_marked_read', {
      success: true,
      notification_ids: data.notification_ids,
      mark_all: data.mark_all
    });

    // Mettre à jour le compteur
    const unreadCount = await this.notificationService.countUnread(userId);
    client.emit('unread_count', { count: unreadCount });
  }

  @SubscribeMessage('get_notifications')
  async handleGetNotifications(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { page?: number; limit?: number; unread_only?: boolean }
  ) {
    const userId = this.findUserIdBySocketId(client.id);
    if (!userId) return;

    const notifications = await this.notificationService.getUserNotifications(
      userId,
      data.page || 1,
      data.limit || 20,
      data.unread_only
    );

    client.emit('notifications_list', notifications);
  }

  @SubscribeMessage('get_unread_count')
  async handleGetUnreadCount(@ConnectedSocket() client: Socket) {
    const userId = this.findUserIdBySocketId(client.id);
    if (!userId) return;

    const count = await this.notificationService.countUnread(userId);
    client.emit('unread_count', { count });
  }
}