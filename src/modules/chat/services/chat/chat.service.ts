// src/chat/services/chat.service.ts
import { plainToInstance } from 'class-transformer';
import { Employee } from 'src/modules/agencies/employee/entities/employee.entity';
import { In, Repository } from 'typeorm';
import { forwardRef, Inject, Injectable, NotFoundException } from '@nestjs/common';




import { InjectRepository } from '@nestjs/typeorm';


import { CreateConversationDto, SendMessageDto, CreateGroupDto } from '../../dto/create-conversation.dto';
import { MessageResponseDto } from '../../dto/message-response.dto';
import { Conversation } from '../../entities/conversation.entity';
import { Message } from '../../entities/messages.entity';
import { ChatGateway } from '../../gateways/chat.gateway';
import { MessageRead } from '../../entities/message-read.entity';







@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(Conversation)
    private conversationRepository: Repository<Conversation>,
    @InjectRepository(MessageRead)
    private messageReadRepository: Repository<MessageRead>,
    @InjectRepository(Message)
    private messageRepository: Repository<Message>,
    @InjectRepository(Employee)
    private userRepository: Repository<Employee>,
    @Inject(forwardRef(() => ChatGateway))
    private chatGateway: ChatGateway,
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

    this.chatGateway
    return group
  }

  async sendMessage(dto: SendMessageDto, senderId: number): Promise<any> {
    const conversation = await this.conversationRepository.findOne({
        where: { id: dto.conversationId },
        relations: ['participants'],
    });

    if (!conversation) {
        throw new NotFoundException('Conversation non trouvée');
    }

    const sender = await this.userRepository.findOne({ where: { id: senderId } });

    if (!sender) {
        throw new NotFoundException(`Utilisateur avec l'ID ${senderId} non trouvé`);
    }

    const message = this.messageRepository.create({
        content: dto.content,
        sender,
        conversation,
    });

    const savedMessage = await this.messageRepository.save(message);

    await this.conversationRepository.update(dto.conversationId, {
        lastMessageAt: new Date(),
        lastMessage: dto.content,
    });

    const finalMessage = await this.messageRepository.findOne({
        where: { id: savedMessage.id },
        relations: ['sender', 'sender.user', 'conversation'],
    });

    if (!finalMessage) {
        throw new NotFoundException('Le message enregistré est introuvable');
    }
    const reads = conversation.participants.map(p => ({
      message,
      reader: p,
      isRead: p.id === senderId, // l'expéditeur a déjà lu
    }));

    await this.messageReadRepository.save(reads);

    return plainToInstance(MessageResponseDto, finalMessage);
  }


async getUserConversations(userId: number): Promise<Conversation[]> {
  return await this.conversationRepository
    .createQueryBuilder('conversation')
    .leftJoinAndSelect('conversation.participants', 'participant')
    .leftJoinAndSelect('conversation.messages', 'message')
    .leftJoinAndSelect('participant.user', 'user')
    .leftJoinAndSelect('message.sender', 'sender')
    .leftJoinAndSelect('sender.user', 'senderUser')
    .loadRelationCountAndMap(
      'conversation.unreadCount', // Nom de la propriété qui contiendra le compte
      'conversation.messages',    // Relation à compter
      'unreadMessages',           // Alias pour la sous-requête
      (qb) => qb
        .leftJoin('unreadMessages.reads', 'read')
        .where('read.readerId = :userId', { userId })
        .andWhere('read.isRead = :isRead', { isRead: false })
    )
    .where('participant.id = :userId', { userId })
    .orderBy('conversation.lastMessageAt', 'DESC')
    .addOrderBy('message.createdAt', 'DESC')
    .getMany();
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
    .leftJoinAndSelect('sender.user', 'senderUser')
    .where('conversation.id = :id', { id: conversationId })
    .getOne();

  if (
    !conversation ||
    !conversation.participants.some(p => p.id === userId)
  ) {
    throw new NotFoundException('Conversation non trouvée');
  }

  return conversation;
}

// for one user, mark all messages as read in a conversation
async markMessagesAsRead(conversationId: number, userId: number): Promise<void> {
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
    this.chatGateway.emitMessagesRead(conversationId, userId);
  }
}

}