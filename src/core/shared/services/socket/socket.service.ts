// src/shared/services/socket.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

@Injectable()
export class SocketService {
  private server: Server;
  private logger = new Logger('SocketService');
  
  private userSockets: Map<number, Set<string>> = new Map();
  private socketToUser: Map<string, number> = new Map();
  private userRooms: Map<number, Set<string>> = new Map();

  setServer(server: Server) {
    this.server = server;
    this.logger.log('✅ Serveur Socket.IO initialisé');
  }

  // Gestion des connexions - maintenant avec le socket direct
  addConnection(userId: number, client: Socket) {
    const socketId = client.id;
    
    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
    }
    this.userSockets.get(userId)?.add(socketId);
    this.socketToUser.set(socketId, userId);

    this.logger.log(`🔌 Utilisateur ${userId} connecté - Socket: ${socketId}`);
    this.logger.debug(`Total utilisateurs connectés: ${this.userSockets.size}`);
    
    // Retourner le client pour permettre le chaînage
    return client;
  }

  removeConnection(socketId: string) {
    const userId = this.socketToUser.get(socketId);
    
    if (userId) {
      this.userSockets.get(userId)?.delete(socketId);
      if (this.userSockets.get(userId)?.size === 0) {
        this.userSockets.delete(userId);
        this.userRooms.delete(userId);
      }
      this.socketToUser.delete(socketId);

      this.logger.log(`🔌 Socket ${socketId} déconnecté pour utilisateur ${userId}`);
      return userId;
    }
    return null;
  }

  // Version modifiée - prend le socket directement
  async joinRoom(client: Socket, userId: number, room: string) {
    if (!client) {
      this.logger.error(`❌ Tentative de joinRoom avec client null pour user ${userId}, room ${room}`);
      return;
    }

    try {
      await client.join(room);
      
      // Enregistrer la room
      if (!this.userRooms.has(userId)) {
        this.userRooms.set(userId, new Set());
      }
      this.userRooms.get(userId)?.add(room);
      
      this.logger.debug(`📌 Socket ${client.id} a rejoint la room ${room} pour user ${userId}`);
      
      // Vérifier que la room a bien été rejointe
      const rooms = Array.from(client.rooms);
      this.logger.debug(`Rooms du socket ${client.id} après join:`, rooms);
    } catch (error) {
      this.logger.error(`Erreur joinRoom: ${error.message}`);
    }
  }

  async joinMultipleRooms(client: Socket, userId: number, rooms: string[]) {
    for (const room of rooms) {
      await this.joinRoom(client, userId, room);
    }
  }

  async leaveRoom(client: Socket, userId: number, room: string) {
    if (!client) return;
    
    await client.leave(room);
    this.userRooms.get(userId)?.delete(room);
    this.logger.debug(`📌 Socket ${client.id} a quitté la room ${room}`);
  }

  // Envoi de messages - utilise toujours la room
  async sendToUser(userId: number, event: string, data: any) {
    const room = `user_${userId}`;
    
    // Vérifier combien de sockets sont dans la room avant d'envoyer
    const sockets = await this.server.in(room).fetchSockets();
    this.logger.debug(`Envoi à room ${room}: ${sockets.length} sockets trouvés`);
    
    this.server.to(room).emit(event, data);
    this.logger.debug(`📨 Notification envoyée à utilisateur ${userId}: ${event}`);
  }

  async sendToRoom(room: string, event: string, data: any) {
    const sockets = await this.server.in(room).fetchSockets();
    this.logger.debug(`Envoi à room ${room}: ${sockets.length} sockets trouvés`);
    this.server.to(room).emit(event, data);
  }

  // Utilitaires
  getUserIdBySocketId(socketId: string): number | undefined {
    return this.socketToUser.get(socketId);
  }

  isUserOnline(userId: number): boolean {
    return this.userSockets.has(userId) && (this.userSockets.get(userId)?.size ?? 0) > 0;
  }

  getUserSocketsCount(userId: number): number {
    return this.userSockets.get(userId)?.size || 0;
  }

  async getRoomSockets(room: string): Promise<any[]> {
    return await this.server.in(room).fetchSockets();
  }
  async sendToAll(event: string, data: any) {
    this.server.emit(event, data);
    this.logger.debug(`📨 Broadcast: ${event}`);
  }
}