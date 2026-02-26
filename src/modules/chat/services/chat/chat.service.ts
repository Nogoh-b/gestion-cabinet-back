// src/chat/services/chat.service.ts
import { plainToInstance } from 'class-transformer';
import { Employee } from 'src/modules/agencies/employee/entities/employee.entity';
import { In, Repository } from 'typeorm';
import { forwardRef, Injectable, NotFoundException } from '@nestjs/common';




import { InjectRepository } from '@nestjs/typeorm';


import { CreateConversationDto, SendMessageDto, CreateGroupDto } from '../../dto/create-conversation.dto';
import { MessageResponseDto } from '../../dto/message-response.dto';
import { Conversation } from '../../entities/conversation.entity';
import { Message } from '../../entities/messages.entity';
import { MessageRead } from '../../entities/message-read.entity';
import { EmployeeService } from 'src/modules/agencies/employee/employee.service';







@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(Conversation)
    private conversationRepository: Repository<Conversation>,
    @InjectRepository(MessageRead)
    private messageReadRepository: Repository<MessageRead>,
    @InjectRepository(Message)
    private messageRepository: Repository<Message>,
    private userService: EmployeeService,
    @InjectRepository(Employee)
    private userRepository: Repository<Employee>,

  ) {
    console.log(forwardRef)
  }

  async createConversation(dto: CreateConversationDto, creatorId: number): Promise<Conversation> {
    const ids = [...dto.participantIds , creatorId]
    console.log('Creating conversation with DTO:', dto, 'and creatorId:', [...dto.participantIds , creatorId]);
    const participants = await this.userRepository.findByIds(ids);
    
    if (participants.length !== ids.length) {
      throw new NotFoundException('Certains utilisateurs n\'existent pas');
    }

    const conversation = this.conversationRepository.create({
      name: dto.name,
      isGroup: dto.isGroup || false,
      participants,
    });

    return await this.conversationRepository.save(conversation);
  }

  async createGroup(dto: CreateGroupDto, creatorId: number): Promise<Conversation> {
    const creator = await this.userRepository.findOne({ where: { id: creatorId } });
    const participants = await this.userRepository.findByIds([creatorId, ...dto.participantIds]);
    
    const conversation = this.conversationRepository.create({
      name: dto.name,
      isGroup: true,
      participants,
    });

    const group = await this.conversationRepository.save(conversation);

    return group
  }

  async sendMessage(dto: SendMessageDto, senderId: number): Promise<any> {
      const conversation = await this.conversationRepository.findOne({
          where: { id: dto.conversationId },
          relations: ['participants', 'participants.user'],
      });

      if (!conversation) {
          throw new NotFoundException('Conversation non trouvée');
      }

      const sender = await this.userService.findOne(senderId);

      if (!sender) {
          throw new NotFoundException(`Utilisateur avec l'ID ${senderId} non trouvé`);
      }

      const message = this.messageRepository.create({
          content: dto.content,
          sender,
          conversation,
      });

      const savedMessage = await this.messageRepository.save(message);

      // ✅ METTRE À JOUR lastMessageData (la vraie colonne)
      await this.conversationRepository.update(dto.conversationId, {
          lastMessageAt: new Date(),
          lastMessageData: {  // ← Utiliser lastMessageData, pas lastMessage
              content: dto.content,
              createdAt: new Date().toISOString(),
              senderId: senderId,
              senderName: sender.user?.full_name || sender.user?.username || 'Utilisateur'
          }
      });

      const finalMessage = await this.messageRepository.findOne({
          where: { id: savedMessage.id },
          relations: ['sender', 'sender.user', 'conversation', 'reads'],
      });

      if (!finalMessage) {
          throw new NotFoundException('Le message enregistré est introuvable');
      }

      const reads = conversation.participants.map(p => ({
          message: savedMessage,
          reader: p,
          isRead: p.id === senderId,
          isReceive: p.id === senderId,
      }));

      await this.messageReadRepository.save(reads);

      return plainToInstance(MessageResponseDto, finalMessage);
  }


  async getUserConversations(userId: number): Promise<Conversation[]> {
      const conversations = await this.conversationRepository
        .createQueryBuilder('conversation')
        .leftJoinAndSelect('conversation.participants', 'participant')
        .leftJoinAndSelect('participant.user', 'user')
        .loadRelationCountAndMap(
          'conversation.unreadCount',
          'conversation.messages',
          'unreadMessages',
          (qb) => qb
            .leftJoin('unreadMessages.reads', 'read')
            .where('read.readerId = :userId', { userId })
            .andWhere('read.isRead = :isRead', { isRead: false })
        )
        .where('EXISTS (SELECT 1 FROM conversation_participants_employee cp WHERE cp.conversationId = conversation.id AND cp.employeeId = :userId)', { userId })
        .orderBy('conversation.lastMessageAt', 'DESC')
        .getMany();

      // Récupérer les derniers messages
      const conversationIds = conversations.map(c => c.id);
      
      const lastMessages = await this.messageRepository
        .createQueryBuilder('message')
        .select([
          'message.conversationId as conversationId',
          'message.content as content',
          'message.createdAt as createdAt',
          'sender.id as senderId',
          // Utiliser les colonnes qui existent réellement
          'user.first_name as senderFirstName',
          'user.last_name as senderLastName',
          'user.username as senderUsername'
        ])
        .leftJoin('message.sender', 'sender')
        .leftJoin('sender.user', 'user')
        .where('message.conversationId IN (:...ids)', { ids: conversationIds })
        .andWhere(qb => {
          const subQuery = qb.subQuery()
            .select('MAX(m.createdAt)')
            .from('message', 'm')
            .where('m.conversationId = message.conversationId')
            .getQuery();
          return 'message.createdAt = ' + subQuery;
        })
        .getRawMany();

      // Associer les derniers messages aux conversations
      const lastMessagesMap = new Map(
        lastMessages.map(msg => [msg.conversationId, msg])
      );

      const convs = conversations.map(conv => {
        const lastMsg = lastMessagesMap.get(conv.id);
        if (lastMsg) {
          // Construire le nom complet à partir des colonnes disponibles
          let senderName = '';
          if (lastMsg.senderFirstName && lastMsg.senderLastName) {
            senderName = `${lastMsg.senderFirstName} ${lastMsg.senderLastName}`;
          } else if (lastMsg.senderUsername) {
            senderName = lastMsg.senderUsername;
          } else {
            senderName = 'Utilisateur';
          }

          conv['lastMessageData'] = {
            content: lastMsg.content,
            createdAt: lastMsg.createdAt.toISOString(),
            senderId: lastMsg.senderId,
            senderName: senderName
          };
        }
        return conv;
      });

      return plainToInstance(Conversation, convs, {
        excludeExtraneousValues: false,
      });
  }

  async getConversationMessages(conversationId: number, userId: number): Promise<Message[]> {
    const conversation = await this.conversationRepository.findOne({
      where: { id: conversationId },
      relations: ['participants'],
    });

    if (!conversation || !conversation.participants.some(p => p.id === userId)) {
      throw new NotFoundException('Conversation non trouvée');
    }

    return await this.messageRepository.find({
      where: { conversation: { id: conversationId } },
      relations: ['sender'],
      order: { createdAt: 'ASC' },
    });
  }

async getConversation(conversationId: number, userId?: number) {
  const conversation = await this.conversationRepository
    .createQueryBuilder('conversation')
    .leftJoinAndSelect('conversation.participants', 'participant')
    .leftJoinAndSelect('participant.user', 'user')
    .leftJoinAndSelect('conversation.messages', 'message')
    .leftJoinAndSelect('message.sender', 'sender')
    .leftJoinAndSelect('message.reads', 'reads')
    .leftJoinAndSelect('reads.reader', 'reader')
    .leftJoinAndSelect('sender.user', 'senderUser')
    .addSelect(['reads.id', 'reads.isRead', 'reads.readAt', 'reader.id'])
    .where('conversation.id = :id', { id: conversationId })
    .getOne();

  if (
    !conversation ||
    !conversation.participants.some(p => p.id === userId)
  ) {
    throw new NotFoundException('Conversation non trouvée');
  }

    // Transformer pour que reader soit directement l'ID
  if (conversation.messages) {
    conversation.messages.forEach(message => {
      if (message.reads) {
        message.reads = message.reads.map(read => ({
          ...read,
          reader: read.reader?.id
        })) as any; // 👈 Force le type
      }
    });
  }

  return plainToInstance(Conversation, conversation, {
    excludeExtraneousValues: false,
  });
}

  async getParticipantIdsExcluding(conversationId: number, excludeUserId: number): Promise<number[]> {
    const conversation = await this.conversationRepository.findOne({
      where: { id: conversationId },
      relations: ['participants'],
    });

    if (!conversation) {
      throw new NotFoundException(`Conversation avec l'ID ${conversationId} non trouvée`);
    }

    return conversation.participants
      .filter(participant => participant.id !== excludeUserId)
      .map(participant => participant.id);
  }

  // for one user, mark all messages as read in a conversation
  async markMessagesAsRead(conversationId: number, userId: number): Promise<any> {
    const messages = await this.messageRepository.find({
      where: { conversation: { id: conversationId } },
      select: ['id']
    });

    const messageIds = messages.map(m => m.id);
    if (messageIds.length === 0) return;

    // 1️⃣ count BEFORE
    const before = await this.messageReadRepository.count({
      where: {
        isRead: false,
        message: { id: In(messageIds) }
      }
    });

    if (before === 0) return; // rien à changer → inutile d’update

    // 2️⃣ update
    await this.messageReadRepository
      .createQueryBuilder()
      .update()
      .set({
        isRead: true,
        readAt: new Date(),
      })
      .where('readerId = :userId', { userId })
      .andWhere('isRead = false')
      .andWhere('messageId IN (:...messageIds)', { messageIds })
      .execute();

    // 3️⃣ count AFTER
    const after = await this.messageReadRepository.count({
      where: {
        isRead: false,
        message: { id: In(messageIds) }
      }
    });

    // 4️⃣ compare
    if (after < before) {
      // this.chatGateway.emitMessagesRead(conversationId, userId);
    }
    return messageIds[0]
  }
  // for one user, mark all messages as read in a conversation
  async markMessagesAsReceive(conversationId: number, userId: number): Promise<any> {
    const messages = await this.messageRepository.find({
      where: { conversation: { id: conversationId } },
      select: ['id']
    });

    const messageIds = messages.map(m => m.id);
    if (messageIds.length === 0) return;

    // 1️⃣ count BEFORE
    const before = await this.messageReadRepository.count({
      where: {
        isReceive: false,
        message: { id: In(messageIds) }
      }
    });

    if (before === 0) return; // rien à changer → inutile d’update

    // 2️⃣ update
    await this.messageReadRepository
      .createQueryBuilder()
      .update()
      .set({
        isReceive: true,
        readAt: new Date(),
      })
      .where('readerId = :userId', { userId })
      .andWhere('isReceive = false')
      .andWhere('messageId IN (:...messageIds)', { messageIds })
      .execute();

    // 3️⃣ count AFTER
    const after = await this.messageReadRepository.count({
      where: {
        isReceive: false,
        message: { id: In(messageIds) }
      }
    });

    // 4️⃣ compare
    if (after < before) {
      // this.chatGateway.emitMessagesRead(conversationId, userId);
    }
    return messageIds[0]
  }

async setReceiveMessagesWithCount(userId: number): Promise<{ updated: number }> {
    const result = await this.messageReadRepository
      .createQueryBuilder()
      .update(MessageRead)
      .set({ isReceive: true })
      .where('reader.id = :userId', { userId })
      .andWhere('isReceive = :isReceive', { isReceive: false })
      .execute();

    return { updated: result.affected || 0 };
  }

}