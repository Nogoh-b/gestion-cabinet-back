// src/chat/gateways/chat.gateway.ts
import { Server, Socket } from 'socket.io';
import { NotificationsService } from 'src/modules/notification/notification.service';
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';




import { SendMessageDto } from '../dto/create-conversation.dto';
import { Message } from '../entities/messages.entity';
import { ChatService } from '../services/chat/chat.service';





@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private connectedUsers: Map<number, string> = new Map();



  
  constructor(
    private chatService: ChatService,
    private notificationsService: NotificationsService,
  ) {}

  async handleConnection(client: Socket) {
    const userId = client.handshake.auth.userId;
    if (userId) {
      this.connectedUsers.set(userId, client.id);
      console.log(`User ${userId} connected`);
      
      // Notifier que l'utilisateur est en ligne
      client.broadcast.emit('userOnline', { userId });
      await this.notificationsService.sendUserStatusNotification(userId, true);
    }
  }

  handleDisconnect(client: Socket) {
    const userId = this.getUserIdBySocketId(client.id);
    if (userId) {
      this.connectedUsers.delete(userId);
      console.log(`User ${userId} disconnected`);
      
      // Notifier que l'utilisateur est hors ligne
      client.broadcast.emit('userOffline', { userId });
      this.notificationsService.sendUserStatusNotification(userId, false);
    }
  }

// src/chat/gateways/chat.gateway.ts
@SubscribeMessage('sendMessage')
async handleMessage(
  @ConnectedSocket() client: Socket,
  @MessageBody() data: SendMessageDto,
) {
  try {
    const userId = this.getUserIdBySocketId(client.id);
    console.log(`📨 Message reçu de l'utilisateur ${userId}:`, data);

    const message = await this.chatService.sendMessage(data, userId);
    console.log(`💾 Message sauvegardé:`, message);

    this.server.sockets.sockets.forEach((socket) => {
      const socketUserId = this.getUserIdBySocketId(socket.id);
      if (socketUserId !== userId) {
        // 🔥 Émettre sur l'événement global pour les notifications
        this.server.emit('new_message', {
          type: 'new_message',
          message,
        });

        // 🔥 Émettre sur la room spécifique pour les mises à jour en temps réel
        this.server.to(`conversation_${data.conversationId}`).emit('conversation_message', {
          type: 'new_message',
          message,
        });

      }
    });

    console.log(`📢 Message diffusé sur les deux canaux`);

    // 🔥 NOTIFICATIONS
    await this.notificationsService.sendMessageNotification(message, userId);

    return { success: true, message };
  } catch (error) {
    console.error('❌ Erreur handleMessage:', error);
    client.emit('error', { message: error.message });
  }
}






  @SubscribeMessage('joinConversation')
  async handleJoinConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: number },
  ) {
    client.join(`conversation_${data.conversationId}`);
    
    const userId = this.getUserIdBySocketId(client.id);
    await this.chatService.markMessagesAsRead(data.conversationId, userId);
    
    client.emit('joinedConversation', { conversationId: data.conversationId });
  }

  @SubscribeMessage('typing')
  handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: number, isTyping: boolean },
  ) {
    const userId = this.getUserIdBySocketId(client.id);
    client.broadcast.to(`conversation_${data.conversationId}`).emit('userTyping', {
      userId,
      isTyping: data.isTyping,
    });
  }



  private sendNotifications(message: Message, conversationId: number) {
    // Implémentez ici l'envoi de notifications push
    // Vous pouvez utiliser Firebase Cloud Messaging, OneSignal, etc.
    console.log('Notification:', message, conversationId);
  }

  private getUserIdBySocketId(socketId: string): any {
    for (const [userId, id] of this.connectedUsers.entries()) {
      if (id === socketId) return userId;
    }
    return null;
  }
}