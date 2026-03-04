// src/shared/gateways/main.gateway.ts
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger } from '@nestjs/common';
import { NotificationType } from 'src/modules/notification/enum/notification-type.enum';
import { ChatService } from 'src/modules/chat/services/chat/chat.service';
import { NotificationService } from 'src/modules/notification/notification.service';
import { NotificationResponseDto } from 'src/modules/notification/dto/notification-response.dto';
import { UsersService } from 'src/modules/iam/user/user.service';

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
  // PAS DE NAMESPACE - utilise le namespace par défaut
})
@Injectable()
export class MainGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private logger = new Logger('MainGateway');
  
  // Maps pour stocker les connexions
  private userSockets: Map<number, Set<string>> = new Map();
  private socketToUser: Map<string, number> = new Map();
  private userRooms: Map<number, Set<string>> = new Map();

  async handleConnection(client: Socket) {
    const userId = client.handshake.auth.userId;
    
    this.logger.log(`🟢 Connexion - User: ${userId}, Socket: ${client.id}`);

    if (!userId) {
      this.logger.warn('Connexion refusée: userId manquant');
      client.disconnect();
      return;
    }

    try {
      // Enregistrer la connexion
      this.addConnection(userId, client);

      // Joindre la room personnelle
      const userRoom = `user_${userId}`;
      await client.join(userRoom);
      this.addUserRoom(userId, userRoom);
      this.userService.update(userId,{is_online : true})
      this.chatService.setReceiveMessagesWithCount(userId)
      // Envoyer les notifications non lues (comportement de NotificationGateway)
      const unreadNotifications = await this.getUnreadNotifications(userId);
      if (unreadNotifications.length > 0) {
        client.emit('unread_notifications', {
          count: unreadNotifications.length,
          notifications: unreadNotifications
        });
      }

      // Notifier les autres (comportement des deux gateways)
      client.broadcast.emit('user_status_changed', {
        userId,
        status: 'online',
        timestamp: new Date().toISOString()
      });

      client.broadcast.emit('userOnline', { userId });

      this.logger.log(`✅ Utilisateur ${userId} connecté`);

    } catch (error) {
      this.logger.error(`Erreur connexion: ${error.message}`);
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    const userId = this.socketToUser.get(client.id);
    
    if (userId) {
      this.removeConnection(client.id);
      
      if (!this.isUserOnline(userId)) {

        client.broadcast.to(`conversation_4`).emit('userOffline', {
          type: 'new_message',
          room: `conversation_4`, 
        });
        const lastSeen  = new Date().toISOString()
        // Notifier les deux types d'événements
        client.broadcast.emit('userOffline', {
          userId,
          status: 'offline',
          timestamp: new Date().toISOString(),
          lastSeen
        });
        this.userService.update(userId,{is_online : false, lastSeen})
        
        // this.server.emit('userOffline', { userId, lastSeen });
      }
      
      this.logger.log(`🔴 User ${userId} déconnecté`);
    }
  }

  // ========== ÉVÉNEMENTS CHAT ==========
  @SubscribeMessage('join_room')
  async joinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: any, // SendMessageDto
  ) {
    const userId = this.getUserIdBySocketId(client.id) || 0; // Fallback à 0 si non trouvé
    const room = data.room;
    await client.join(room);
    this.addUserRoom(userId, room);
    if(data.join_parent){
      await client.join(room.split('_')[0]);
      this.addUserRoom(userId, room.split('_')[0]);
    }
    client.emit('joined_room', { room });
    this.logger.log(`📌 User ${userId} rejoint la room ${room}`);

    const socketsInRoom = await this.server.in(room).fetchSockets();
    // ✅ Extraire les userIds uniques
    const onlineUserIds = Array.from(
      new Set(
        socketsInRoom
          .map(s => this.getUserIdBySocketId(s.id))
          .filter(id => id !== undefined)
      )
    );
      // ✅ Envoyer uniquement au client qui vient de rejoindre
      client.emit('room_online_users', {
        room,
        users: onlineUserIds
      });

    client.broadcast.to(room).emit('user_joined', {
      userId,
      room
    });

  }

  // ========== ÉVÉNEMENTS CHAT ==========
  @SubscribeMessage('sendMessage')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: any, // SendMessageDto
  ) {
    try {
      const userId = this.getUserIdBySocketId(client.id) || 0; // Fallback à 0 si non trouvé
      this.logger.log(`📨 sendMessage reçu de user ${userId}:`, data);

      // Appeler votre service chat existant
      const message = await this.chatService.sendMessageWithExistingAttachments(data, userId);
      // const message = await this.chatService.sendMessage(data, userId);
      const idsParticipants = await this.chatService.getParticipantIdsExcluding(data.conversationId, userId)
 
      idsParticipants.forEach(participantId => {
        this.server.to(`user_${participantId}`).emit('new_message', {
          type: 'room_message',
          conversationId: data.conversationId,
          message,
          room: `conversation_${data.conversationId}`, // ✅ Ajouter la room
        });
      });

      client.broadcast.to(`conversation_${data.conversationId}`).emit('room_message', {
        type: 'new_message',
        message,
        room: `conversation_${data.conversationId}`, // ✅ Ajouter la room

      });
      this.logger.log(`✅ Message envoyé à la conversation ${data.conversationId}`);


      // Notifications via le service notification existant
      await this.notificationService.sendMessageNotification(message, userId);

      return { success: true, message };
    } catch (error) {
      client.emit('error', { message: error.message });
    }
  }

  @SubscribeMessage('typing')
  handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: {
      conversationId: number;
      isTyping: boolean;
      room: string;
      userName: string;
    },
  ) {
    try {
      const userId = this.getUserIdBySocketId(client.id);
      if (!userId) return;

      this.logger.debug(
        `⌨️ typing user ${userId} in ${data.room}: ${data.isTyping}`,
      );

      // broadcast à la room SAUF l'émetteur
      client.broadcast.to(data.room).emit('typing', {
        userId,
        conversationId: data.conversationId,
        isTyping: data.isTyping,
        room: data.room,
        userName: data.userName // Vous pouvez remplacer par le nom réel de l'utilisateur si disponible
      });

      return { success: true };
    } catch (error) {
      this.logger.error('❌ typing error', error);
      client.emit('error', { message: error.message });
    }
  }




  // src/shared/gateways/main.gateway.ts (extrait des méthodes à ajouter)

// src/core/shared/services/socket/main.gateway.ts

@SubscribeMessage('send_notification')
async handleSendNotification(
  @ConnectedSocket() client: Socket,
  @MessageBody() data: {
    user_ids: number[]; // Liste des IDs des utilisateurs à notifier
    type: NotificationType | string;
    title: string;
    content?: string;
    data?: any;
    link?: string;
    priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
    actions?: any[];
    image_url?: string;
    exclude_current_user?: boolean; // Optionnel: exclure l'utilisateur qui envoie
    save_to_db?: boolean; // Optionnel: sauvegarder en base
  }
) {
  try {
    const senderId = this.getUserIdBySocketId(client.id);
    this.logger.log(`🔔 send_notification reçu de user ${senderId}:`, {
      ...data,
      user_ids: data.user_ids
    });

    // Validation des données
    if (!data.user_ids || !Array.isArray(data.user_ids) || data.user_ids.length === 0) {
      throw new Error('La liste user_ids est requise et doit contenir au moins un ID');
    }

    if (!data.type || !data.title) {
      throw new Error('Le type et le titre sont requis');
    }

    // Filtrer les utilisateurs cibles
    let targetUserIds = [...data.user_ids];

    // Exclure l'utilisateur courant si demandé
    if (data.exclude_current_user && senderId) {
      targetUserIds = targetUserIds.filter(id => id !== senderId);
    }

    if (targetUserIds.length === 0) {
      this.logger.log('Aucun utilisateur à notifier après filtrage');
      client.emit('notification_sent', {
        success: true,
        count: 0,
        message: 'Aucun utilisateur à notifier'
      });
      return { success: true, count: 0 };
    }

    let savedNotifications : NotificationResponseDto[] = [];

    // Sauvegarder en base si demandé (par défaut true)
    if (data.save_to_db !== false) {
      // Utiliser la méthode createBulk du service avec la nouvelle architecture
      savedNotifications = await this.notificationService.createBulk({
        user_ids: targetUserIds,
        type: data.type as NotificationType,
        title: data.title,
        content: data.content,
        data: {
          ...data.data,
          senderId: senderId,
          senderType: 'user',
          notificationType: 'direct'
        },
        link: data.link,
        priority: data.priority || 'MEDIUM',
        actions: data.actions || [],
        image_url: data.image_url
      }, senderId || 1);
    }

    // Émettre en temps réel à chaque utilisateur connecté
    const deliveryResults = await Promise.all( 
      targetUserIds.map(async (userId) => {
        const userSockets = this.getUserSockets(userId);
        
        if (userSockets.length > 0) {
          // Trouver la notification correspondante si sauvegardée
          const userNotification = savedNotifications.find(
            n => n && (n as any).user_id === userId
          );

          // Préparer le payload
          const notificationPayload = {
            type: 'notification',
            notification: userNotification || {
              id: `temp_${Date.now()}_${userId}`,
              type: data.type,
              title: data.title,
              content: data.content || data.title,
              data: {
                ...data.data,
                senderId: senderId,
                timestamp: new Date().toISOString()
              },
              link: data.link,
              priority: data.priority || 'MEDIUM',
              actions: data.actions || [],
              image_url: data.image_url,
              is_read: false,
              created_at: new Date().toISOString()
            }
          };

          // Envoyer à tous les sockets de l'utilisateur
          userSockets.forEach(socketId => {
            this.server.to(socketId).emit('new_notification', notificationPayload);
          });
          
          return { userId, delivered: true, socketCount: userSockets.length };
        }
        
        return { userId, delivered: false, socketCount: 0 };
      })
    );

    // Statistiques de livraison
    const deliveredCount = deliveryResults.filter(r => r.delivered).length;
    const offlineCount = deliveryResults.filter(r => !r.delivered).length;

    // Réponse au sender
    client.emit('notification_sent', {
      success: true,
      count: targetUserIds.length,
      saved: savedNotifications.length,
      delivered: deliveredCount,
      offline: offlineCount,
      details: {
        targetUsers: targetUserIds,
        delivery: deliveryResults
      }
    });

    this.logger.log(`✅ Notification envoyée à ${deliveredCount}/${targetUserIds.length} utilisateurs (${offlineCount} hors ligne)`);
    
    return { 
      success: true, 
      count: targetUserIds.length,
      saved: savedNotifications.length,
      delivered: deliveredCount,
      offline: offlineCount
    };

  } catch (error) {
    this.logger.error('❌ Erreur send_notification:', error);
    client.emit('error', { 
      message: 'Erreur lors de l\'envoi de la notification',
      details: error.message 
    });
    
    return { 
      success: false, 
      error: error.message 
    };
  }
}

@SubscribeMessage('broadcast_notification')
async handleBroadcastNotification(
  @ConnectedSocket() client: Socket,
  @MessageBody() data: {
    type: NotificationType | string;
    title: string;
    content?: string;
    data?: any;
    link?: string;
    priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
    actions?: any[];
    image_url?: string;
    roles?: string[]; // Optionnel: filtrer par rôle
    exclude_user_ids?: number[]; // Optionnel: exclure certains utilisateurs
    save_to_db?: boolean; // Optionnel: sauvegarder en base ou non
    exclude_current_user?: boolean; // Exclure l'envoyeur
  }
) {
  try {
    const senderId = this.getUserIdBySocketId(client.id);
    this.logger.log(`📢 broadcast_notification reçu de user ${senderId}:`, data);

    // Validation
    if (!data.type || !data.title) {
      throw new Error('Le type et le titre sont requis');
    }

    // Récupérer tous les utilisateurs (à adapter selon votre service)
    let targetUsers = await this.notificationService.findAllUser();
    
    // Garder une trace du total avant filtrage pour les logs
    const totalBeforeFilter = targetUsers.length;

    // Appliquer les filtres
    /*if (!data.include_all) {
      // Filtrer par rôle si spécifié
      if (data.roles && data.roles.length > 0) {
        targetUsers = targetUsers.filter(user => 
          data.roles?.includes(user.role)
        );
      }

      // Exclure certains utilisateurs
      if (data.exclude_user_ids && data.exclude_user_ids.length > 0) {
        targetUsers = targetUsers.filter(user => 
          !data.exclude_user_ids?.includes(user.id)
        );
      }

      // Exclure l'envoyeur si demandé
      if (data.exclude_current_user && senderId) {
        targetUsers = targetUsers.filter(user => user.id !== senderId);
      }
    }*/

    // Extraire les IDs des utilisateurs cibles
    const targetUserIds = targetUsers.map(user => user.id);

    this.logger.log(`👥 Broadcast cible: ${targetUserIds.length}/${totalBeforeFilter} utilisateurs`);

    let savedNotifications : NotificationResponseDto[] = [];

    // Sauvegarder en base si demandé (par défaut true)
    // if (data.save_to_db !== false && targetUserIds.length > 0) {
    if (data.save_to_db !== false) {
      savedNotifications = await this.notificationService.createBulk({
        user_ids: targetUserIds,
        broadcast:true,
        type: data.type as NotificationType,
        title: data.title,
        content: data.content,
        data: {
          ...data.data,
          senderId: senderId,
          broadcast: true,
          broadcastFilters: {
            roles: data.roles,
            excludeUserIds: data.exclude_user_ids
          }
        },
        link: data.link,
        priority: data.priority || 'MEDIUM',
        actions: data.actions || [],
        image_url: data.image_url
      }, senderId || 0);

      this.logger.log(`💾 ${savedNotifications.length} notifications sauvegardées en base`);
    }

    // Préparer la notification à broadcast (sans userIds)
    const broadcastPayload = {
      type: 'broadcast_notification',
      notification: {
        id: `broadcast_${Date.now()}`,
        type: data.type,
        title: data.title,
        content: data.content || data.title,
        data: {
          ...data.data,
          senderId: senderId,
          broadcast: true,
          broadcastFilters: {
            roles: data.roles,
            excludeUserIds: data.exclude_user_ids
          },
          timestamp: new Date().toISOString()
        },
        link: data.link,
        priority: data.priority || 'MEDIUM',
        actions: data.actions || [],
        image_url: data.image_url,
        is_read: false,
        created_at: new Date().toISOString()
      }
    };

    // Broadcast à TOUS les utilisateurs connectés (peu importe les filtres)
    // Les filtres côté client seront appliqués par l'interface utilisateur
    this.server.emit('new_notification', broadcastPayload);

    // Statistiques de connexion (pour information)
    const connectedUserIds = Array.from(this.userSockets.keys());
    const connectedTargetUsers = this.userSockets /*targetUserIds.filter(id => 
      connectedUserIds.includes(id)
    );*/
    // Réponse au sender avec les statistiques
    const response = {
      success: true,
      stats: {
        total: targetUserIds.length,
        connected: connectedTargetUsers.size,
        offline: targetUserIds.length - connectedTargetUsers.size,
        saved: savedNotifications.length,
        filters: {
          roles: data.roles,
          excludeUserIds: data.exclude_user_ids,
          excludeCurrentUser: data.exclude_current_user
        }
      },
      message: `Broadcast envoyé à ${connectedTargetUsers.size} utilisateurs connectés (${targetUserIds.length - connectedTargetUsers.size} hors ligne recevront à la connexion)`,
      timestamp: new Date().toISOString()
    };

    client.emit('broadcast_sent', response);

    this.logger.log(`✅ Broadcast envoyé - Connectés: ${connectedTargetUsers.size}/${targetUserIds.length}`);

    return { 
      success: true, 
      stats: response.stats
    };

  } catch (error) {
    this.logger.error('❌ Erreur broadcast_notification:', error);
    client.emit('error', { 
      message: 'Erreur lors du broadcast',
      details: error.message 
    });
    
    return { 
      success: false, 
      error: error.message 
    };
  }
}



// Méthode utilitaire pour récupérer les sockets d'un utilisateur



private getUserSockets(userId: number): string[] {
  const sockets: string[] = [];
  
  // Parcourir la map socketToUser pour trouver tous les sockets de cet utilisateur
  for (const [socketId, uid] of this.socketToUser.entries()) {
    if (uid === userId) {
      sockets.push(socketId);
    }
  }
  
  return sockets;
}
  





  @SubscribeMessage('userReadMessage')
  async handleReadsMessageConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: number , roomName: string},
  ) {
    const userId = this.getUserIdBySocketId(client.id) || 0; // Fallback à 0 si non trouvé
    
    const lastMessageId = await this.chatService.markMessagesAsRead(data.conversationId, userId);

    client.broadcast.to(data.roomName).emit('messagesReaded', { room: data.roomName, conversationId: data.conversationId, lastMessageId, userId });
    this.logger.log(`📌 Socket ${userId} a lu les message de la conversation  ${data.roomName}`);

  }

  @SubscribeMessage('userReceiveMessage')
  async handleUserReceiveMessageConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: number , roomName: string},
  ) {
    const userId = this.getUserIdBySocketId(client.id) || 0; // Fallback à 0 si non trouvé
    
    const lastMessageId = await this.chatService.markMessagesAsReceive(data.conversationId, userId);

    const idsParticipants = await this.chatService.getParticipantIdsExcluding(data.conversationId, userId)
 
    idsParticipants.forEach(participantId => {
      this.logger.log(`📌 Envoi messagesReceived a  ${participantId} a lu les message de la conversation  ${data.roomName}`);

      this.server.to(`user_${participantId}`).emit('new_message', {
        type: 'messagesReceived',
        conversationId: data.conversationId,
        lastMessageId,
        room: data.roomName, // ✅ Ajouter la room
        userId
      });
    });

    client.broadcast.to(data.roomName).emit('messagesReceived', 
      { room: data.roomName, conversationId: data.conversationId, lastMessageId, userId }
    );
    this.logger.log(`📌 Socket ${userId} a lu les message de la conversation  ${data.roomName}`);

  }

  // @SubscribeMessage('typing')
  // handleTyping(
  //   @ConnectedSocket() client: Socket,
  //   @MessageBody() data: { conversationId: number, isTyping: boolean },
  // ) {
  //   const userId = this.getUserIdBySocketId(client.id);
  //   client.broadcast.to(`conversation_${data.conversationId}`).emit('userTyping', {
  //     userId,
  //     isTyping: data.isTyping,
  //   });
  // }

  @SubscribeMessage('messages_read')
  async handleMessagesRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: number, lastReadMessageId?: number },
  ) {
    const userId = this.getUserIdBySocketId(client.id) || 0; // Fallback à 0 si non trouvé
    
    // Marquer comme lu en DB
    await this.chatService.markMessagesAsRead(data.conversationId, userId);
    
    // Notifier les autres participants
    const conversation = await this.chatService.getConversation(data.conversationId, userId);
    const participantIds = conversation.participants.map(p => p.id);
    
    participantIds.forEach(participantId => {
      if (participantId !== userId) {
        this.sendToUser(participantId, 'messages_read', {
          type: 'messages_read',
          conversationId: data.conversationId,
          readerUserId: userId,
          lastReadMessageId: data.lastReadMessageId,
        });

        this.sendToUser(participantId, 'messages_readA', {
          type: 'messages_readA',
          conversationId: data.conversationId,
          readerUserId: userId,
          readAt: new Date().toISOString()
        });
      }
    });
  }

  // ========== ÉVÉNEMENTS NOTIFICATION ==========
  @SubscribeMessage('subscribe_to_dossier')
  handleSubscribeToDossier(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { dossierId: number }
  ) {
    const userId = this.getUserIdBySocketId(client.id) || 0; // Fallback à 0 si non trouvé
    const room = `dossier_${data.dossierId}`;
    
    client.join(room);
    this.addUserRoom(userId, room);

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
    
    const userId = this.getUserIdBySocketId(client.id) || 0; // Fallback à 0 si non trouvé
    this.userRooms.get(userId)?.delete(room);

    this.logger.log(`📌 Socket ${client.id} désabonné du dossier ${data.dossierId}`);
    return { success: true };
  }

  @SubscribeMessage('mark_notifications_read')
  async handleMarkNotificationsRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { notification_ids?: number[]; mark_all?: boolean }
  ) {
    const userId = this.getUserIdBySocketId(client.id);
    if (!userId) return;

    if (data.mark_all) {
      await this.notificationService.markAllAsRead(userId);
    } else if (data.notification_ids) {
      await this.notificationService.markAsRead(data.notification_ids, userId);
    }

    client.emit('notifications_marked_read', {
      success: true,
      notification_ids: data.notification_ids,
      mark_all: data.mark_all
    });

    const unreadCount = await this.notificationService.countUnread(userId);
    client.emit('unread_count', { count: unreadCount });
  }

  @SubscribeMessage('get_notifications')
  async handleGetNotifications(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { page?: number; limit?: number; unread_only?: boolean }
  ) {
    const userId = this.getUserIdBySocketId(client.id);
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
    const userId = this.getUserIdBySocketId(client.id);
    if (!userId) return;

    const count = await this.notificationService.countUnread(userId);
    client.emit('unread_count', { count });
  }

  @SubscribeMessage('get_my_rooms')
  handleGetMyRooms(@ConnectedSocket() client: Socket) {
    const rooms = Array.from(client.rooms);
    client.emit('my_rooms', rooms);
  }

  // ========== MÉTHODES D'ENVOI ==========
  async sendToUser(userId: number, event: string, data: any) {
    const room = `user_${userId}`;
    const sockets = await this.server.in(room).fetchSockets();
    
    if (sockets.length > 0) {
      this.server.to(room).emit(event, data);
      this.logger.debug(`📨 ${event} envoyé à user ${userId}`);
      return true;
    }
    return false;
  }

  async sendToRoom(room: string, event: string, data: any) {
    this.server.to(room).emit(event, data);
  }

  async sendToAll(event: string, data: any) {
    this.server.emit(event, data);
  }

  // ========== MÉTHODES SPÉCIFIQUES POUR NOTIFICATIONS ==========
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
      timestamp: new Date().toISOString()
    };

    recipientIds.forEach(userId => {
      this.sendToUser(userId, 'new_notification', notification);
    });

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
      timestamp: new Date().toISOString()
    };

    userIds.forEach(userId => {
      this.sendToUser(userId, 'new_notification', notification);
    });

    this.sendToRoom(`dossier_${dossierId}`, 'dossier_activity', {
      type: 'update',
      update,
      notification
    });
  }

  // ========== MÉTHODES PRIVÉES ==========
  private addConnection(userId: number, client: Socket) {
    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
    }
    this.userSockets.get(userId)?.add(client.id);
    this.socketToUser.set(client.id, userId);
  }

  private removeConnection(socketId: string) {
    const userId = this.socketToUser.get(socketId);
    if (userId) {
      this.userSockets.get(userId)?.delete(socketId);
      if (this.userSockets.get(userId)?.size === 0) {
        this.userSockets.delete(userId);
        this.userRooms.delete(userId);
      }
      this.socketToUser.delete(socketId);
    }
  }

  private addUserRoom(userId: number, room: string) {
    if (!this.userRooms.has(userId)) {
      this.userRooms.set(userId, new Set());
    }
    this.userRooms.get(userId)?.add(room);
  }

  private getUserIdBySocketId(socketId: string): number | undefined {
    return this.socketToUser.get(socketId);
  }

  private isUserOnline(userId: number): boolean {
    return this.userSockets.has(userId) && (this.userSockets.get(userId)?.size ?? 0) > 0;
  }

  private async getUnreadNotifications(userId: number): Promise<any[]> {
    // Implémentez selon votre logique
    return this.notificationService.getUnreadNotifications(userId);
  }

  // ========== INJECTION DES SERVICES ==========
  constructor(
    private chatService: ChatService,
    private notificationService: NotificationService,
    private userService: UsersService
  ) {}
}