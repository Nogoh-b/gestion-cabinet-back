// src/chat/services/chat.service.ts
import { plainToInstance } from 'class-transformer';
import { Employee } from 'src/modules/agencies/employee/entities/employee.entity';
import { Repository } from 'typeorm';
import { Injectable, NotFoundException } from '@nestjs/common';




import { InjectRepository } from '@nestjs/typeorm';


import { CreateConversationDto, SendMessageDto, CreateGroupDto } from '../../dto/create-conversation.dto';
import { MessageResponseDto } from '../../dto/message-response.dto';
import { Conversation } from '../../entities/conversation.entity';
import { Message } from '../../entities/messages.entity';







@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(Conversation)
    private conversationRepository: Repository<Conversation>,
    @InjectRepository(Message)
    private messageRepository: Repository<Message>,
    @InjectRepository(Employee)
    private userRepository: Repository<Employee>,
  ) {}

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

    return await this.conversationRepository.save(conversation);
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
    });

    const finalMessage = await this.messageRepository.findOne({
        where: { id: savedMessage.id },
        relations: ['sender', 'sender.user', 'conversation'],
    });

    if (!finalMessage) {
        throw new NotFoundException('Le message enregistré est introuvable');
    }

    return plainToInstance(MessageResponseDto, finalMessage);
  }


  async getUserConversations(userId: number): Promise<Conversation[]> {
    return await this.conversationRepository
      .createQueryBuilder('conversation')
      .leftJoinAndSelect('conversation.participants', 'participants')
      .leftJoinAndSelect('conversation.messages', 'messages')
      .leftJoinAndSelect('messages.sender', 'sender')
      .where('participants.id = :userId', { userId })
      .orderBy('conversation.lastMessageAt', 'DESC')
      .addOrderBy('messages.createdAt', 'DESC')
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

  async getConversation(conversationId: number, userId: number): Promise<Conversation> {
    const conversation = await this.conversationRepository.findOne({
      where: { id: conversationId },
      relations: ['participants'],
    });

    if (!conversation || !conversation.participants.some(p => p.id === userId)) {
      throw new NotFoundException('Conversation non trouvée');
    }
    return conversation
    /*return await this.messageRepository.find({
      where: { conversation: { id: conversationId } },
      relations: ['sender'],
      order: { createdAt: 'ASC' },
    });*/
  }

  async markMessagesAsRead(conversationId: number, userId: number): Promise<void> {
    await this.messageRepository
      .createQueryBuilder()
      .update(Message)
      .set({ isRead: true })
      .where('conversationId = :conversationId', { conversationId })
      .andWhere('senderId != :userId', { userId })
      .andWhere('isRead = false')
      .execute();
  }
}