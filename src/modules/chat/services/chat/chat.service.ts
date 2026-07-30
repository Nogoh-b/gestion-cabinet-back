// src/chat/services/chat.service.ts
import { plainToInstance } from 'class-transformer';
import { createHash } from 'crypto';
import { Employee } from 'src/modules/agencies/employee/entities/employee.entity';
import { DataSource, In, IsNull, Repository } from 'typeorm';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';




import { InjectRepository } from '@nestjs/typeorm';


import { CreateConversationDto, SendMessageDto, CreateGroupDto, ChatReferenceDto } from '../../dto/create-conversation.dto';
import { MessageResponseDto } from '../../dto/message-response.dto';
import { Conversation } from '../../entities/conversation.entity';
import { Message } from '../../entities/messages.entity';
import { MessageRead } from '../../entities/message-read.entity';
import { EmployeeService } from 'src/modules/agencies/employee/employee.service';
import {
  Attachment,
  AttachmentType,
  ChatAttachmentSecurityStatus,
} from '../../entities/attachment.entity';
import {
  ChatAttachmentStorageService,
  StoredChatAttachment,
} from './chat-attachment-storage.service';
import { getCurrentTenantId } from 'src/core/tenant/tenant.context';
import { AuditService } from 'src/core/audit/audit.service';







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
    @InjectRepository(Attachment)
    private attachmentRepository: Repository<Attachment>,
    private readonly attachmentStorage: ChatAttachmentStorageService,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
  ) {}

  private async getParticipantConversation(
    conversationId: number,
    userId: number,
  ): Promise<Conversation> {
    const id = Number(conversationId);
    const actorId = Number(userId);
    if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(actorId) || actorId <= 0) {
      throw new NotFoundException('Conversation non trouvée');
    }
    const conversation = await this.conversationRepository.findOne({
      where: { id, tenant_id: getCurrentTenantId() },
      relations: ['participants', 'participants.user', 'dossier'],
    });
    if (!conversation?.participants?.some(participant => participant.id === actorId)) {
      throw new NotFoundException('Conversation non trouvée');
    }
    return conversation;
  }

  private sanitizeReferences(references?: ChatReferenceDto[]): ChatReferenceDto[] {
    if (!Array.isArray(references)) return [];

    const cleanText = (value: unknown): string => String(value ?? '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/\s+/g, ' ')
      .trim();

    const allowedMetaKeys = new Set(['reference', 'numero', 'email', 'phone', 'date']);
    const allowedTypes = new Set([
      'client',
      'customer',
      'dossier',
      'employee',
      'collaborateur',
      'procedure',
      'diligence',
      'audience',
      'facture',
      'document',
      'fournisseur',
      'supplier',
      'apporteur',
      'referrer',
    ]);
    return references
      .filter(ref => ref && ref.type && allowedTypes.has(String(ref.type).toLowerCase()) && ref.id !== undefined && ref.id !== null && ref.label)
      .slice(0, 10)
      .map(ref => {
        const type = String(ref.type).toLowerCase();
        const meta: NonNullable<ChatReferenceDto['meta']> = {};
        if (ref.meta && typeof ref.meta === 'object') {
          for (const [key, value] of Object.entries(ref.meta)) {
            if (!allowedMetaKeys.has(key) || value === undefined || value === null) continue;
            meta[key as keyof NonNullable<ChatReferenceDto['meta']>] = cleanText(value).slice(0, 200);
          }
        }

        const clean: ChatReferenceDto = {
          type: type.slice(0, 50),
          id: typeof ref.id === 'number' ? ref.id : String(ref.id).slice(0, 80),
          label: cleanText(ref.label).slice(0, 200),
        };

        if (ref.href && String(ref.href).startsWith('/')) clean.href = String(ref.href).slice(0, 500);
        if (Object.keys(meta).length) clean.meta = meta;
        return clean;
      });
  }

  async createConversation(dto: CreateConversationDto, creatorId: number): Promise<Conversation> {
    const ids = [...new Set([...(dto.participantIds ?? []).map(Number), Number(creatorId)])];
    const participants = await this.userRepository.find({
      where: {
        id: In(ids),
        tenant_id: getCurrentTenantId(),
      },
    });
    
    if (participants.length !== ids.length) {
      throw new NotFoundException('Un ou plusieurs participants sont introuvables');
    }

    const conversation = this.conversationRepository.create({
      name: dto.name,
      isGroup: dto.isGroup || false,
      participants,
    });

    return await this.conversationRepository.save(conversation);
  }

  async createGroup(dto: CreateGroupDto, creatorId: number): Promise<Conversation> {
    const ids = [...new Set([Number(creatorId), ...(dto.participantIds ?? []).map(Number)])];
    const participants = await this.userRepository.find({
      where: {
        id: In(ids),
        tenant_id: getCurrentTenantId(),
      },
    });
    if (participants.length !== ids.length) {
      throw new NotFoundException('Un ou plusieurs participants sont introuvables');
    }
    
    const conversation = this.conversationRepository.create({
      name: dto.name,
      isGroup: true,
      participants,
    });

    const group = await this.conversationRepository.save(conversation);

    return group
  }

  async sendMessage(dto: SendMessageDto, senderId: number): Promise<any> {
    return this.sendMessageWithAttachments(dto, senderId, []);
  }


  async sendMessageWithAttachments(
    dto: SendMessageDto, 
    senderId: number, 
    files: Express.Multer.File[]
  ): Promise<MessageResponseDto> {
    const references = this.sanitizeReferences(dto.references);
    // Validation de base
    if (!dto.content && files.length === 0) {
      throw new BadRequestException('Un message doit avoir du contenu ou des pièces jointes');
    }

    // 1. Récupération et validation de la conversation
    const conversation = await this.getParticipantConversation(
      dto.conversationId,
      senderId,
    );

    // 2. Validation de l'expéditeur
    const sender = await this.userService.findOne(senderId);
    if (!sender) {
      throw new NotFoundException(`Utilisateur avec l'ID ${senderId} non trouvé`);
    }

    // 3. Analyse antivirus obligatoire et stockage privé.
    const uploadedAttachments: StoredChatAttachment[] = [];
    try {
      for (const file of files) {
        uploadedAttachments.push(await this.attachmentStorage.store(file));
      }
    } catch (error) {
      await Promise.all(
        uploadedAttachments.map(item =>
          this.attachmentStorage.remove(item.storageKey).catch(() => undefined),
        ),
      );
      throw error;
    }

    const tenantId = getCurrentTenantId();
    try {
      return await this.dataSource.transaction(async manager => {
        const messageRepository = manager.getRepository(Message);
        const attachmentRepository = manager.getRepository(Attachment);
        const conversationRepository = manager.getRepository(Conversation);
        const messageReadRepository = manager.getRepository(MessageRead);
        const message = messageRepository.create({
          content: dto.content ?? '',
          sender,
          conversation,
          hasAttachments: uploadedAttachments.length > 0,
          references,
          tenant_id: tenantId,
        });
        const savedMessage = await messageRepository.save(message);
        const attachments = uploadedAttachments.map(fileInfo =>
          attachmentRepository.create({
            ...fileInfo,
            fileType: fileInfo.fileType as AttachmentType,
            securityStatus: ChatAttachmentSecurityStatus.CLEAN,
            conversationId: conversation.id,
            uploadedById: senderId,
            message: savedMessage,
            tenant_id: tenantId,
          }),
        );
        if (attachments.length) {
          await attachmentRepository.save(attachments);
        }
        savedMessage.attachments = attachments;

        const lastMessageData: any = {
          content: dto.content || (files.length > 0 ? '📎 Pièce jointe' : ''),
          createdAt: new Date().toISOString(),
          senderId,
          senderName:
            sender.user?.full_name ||
            sender.user?.username ||
            'Utilisateur',
          referencesCount: references.length,
          hasAttachments: attachments.length > 0,
          attachmentsCount: attachments.length,
          attachmentsTypes: [
            ...new Set(uploadedAttachments.map(item => item.mimeType)),
          ],
        };
        await conversationRepository.update(
          { id: conversation.id, tenant_id: tenantId },
          { lastMessageAt: new Date(), lastMessageData },
        );
        const reads = conversation.participants.map(participant =>
          messageReadRepository.create({
            message: savedMessage,
            reader: participant,
            isRead: participant.id === senderId,
            isReceive: participant.id === senderId,
            tenant_id: tenantId,
          }),
        );
        await messageReadRepository.save(reads);
        const finalMessage = await messageRepository.findOne({
          where: { id: savedMessage.id, tenant_id: tenantId },
          relations: [
            'sender',
            'sender.user',
            'conversation',
            'reads',
            'attachments',
          ],
        });
        return plainToInstance(MessageResponseDto, finalMessage);
      });
    } catch (error) {
      await Promise.all(
        uploadedAttachments.map(item =>
          this.attachmentStorage.remove(item.storageKey).catch(() => undefined),
        ),
      );
      throw error;
    }
  }


  async sendMessageWithExistingAttachments(
    dto: SendMessageDto, 
    senderId: number, 
  ): Promise<MessageResponseDto> {
    // Validation de base
    const attachmentIds = dto.attachmentIds ?? [];
    const references = this.sanitizeReferences(dto.references);
    if (!dto.content && attachmentIds.length === 0) {
      throw new BadRequestException('Un message doit avoir du contenu ou des pièces jointes');
    }

    // 1. Récupération et validation de la conversation
    const conversation = await this.getParticipantConversation(
      dto.conversationId,
      senderId,
    );

    // 2. Validation de l'expéditeur
    const sender = await this.userService.findOne(senderId);
    if (!sender) {
      throw new NotFoundException(`Utilisateur avec l'ID ${senderId} non trouvé`);
    }

    // 3. Récupération des attachments existants par leurs IDs
    let attachments: Attachment[] = [];
    if (attachmentIds.length > 0) {
      const uniqueAttachmentIds = [...new Set(attachmentIds.map(Number))];
      attachments = await this.attachmentRepository.find({
        where: {
          id: In(uniqueAttachmentIds),
          tenant_id: getCurrentTenantId(),
          conversationId: conversation.id,
          uploadedById: senderId,
          message: IsNull(),
        },
      });
      
      // Vérifier que tous les IDs sont valides
      if (attachments.length !== uniqueAttachmentIds.length) {
        throw new NotFoundException('Une ou plusieurs pièces jointes sont introuvables');
      }
    }

    const tenantId = getCurrentTenantId();
    return this.dataSource.transaction(async manager => {
      const messageRepository = manager.getRepository(Message);
      const attachmentRepository = manager.getRepository(Attachment);
      const conversationRepository = manager.getRepository(Conversation);
      const messageReadRepository = manager.getRepository(MessageRead);
      const message = messageRepository.create({
        content: dto.content ?? '',
        sender,
        conversation,
        hasAttachments: attachments.length > 0,
        references,
        tenant_id: tenantId,
      });
      const savedMessage = await messageRepository.save(message);

      for (const attachment of attachments) {
        const claim = await attachmentRepository
          .createQueryBuilder()
          .update(Attachment)
          .set({ message: savedMessage })
          .where('id = :id', { id: attachment.id })
          .andWhere('tenant_id = :tenantId', { tenantId })
          .andWhere('conversation_id = :conversationId', {
            conversationId: conversation.id,
          })
          .andWhere('uploaded_by_id = :senderId', { senderId })
          .andWhere('messageId IS NULL')
          .execute();
        if (claim.affected !== 1) {
          throw new NotFoundException(
            'Une ou plusieurs pièces jointes sont introuvables',
          );
        }
        attachment.message = savedMessage;
      }
      savedMessage.attachments = attachments;

      const lastMessageData: any = {
        content:
          dto.content || (attachmentIds.length > 0 ? '📎 Pièce jointe' : ''),
        createdAt: new Date().toISOString(),
        senderId,
        senderName:
          sender.user?.full_name ||
          sender.user?.username ||
          'Utilisateur',
        referencesCount: references.length,
      };
      if (attachments.length > 0) {
        lastMessageData.hasAttachments = true;
        lastMessageData.attachmentsCount = attachments.length;
        lastMessageData.attachmentsTypes = [
          ...new Set(attachments.map(attachment => attachment.mimeType)),
        ];
        lastMessageData.attachmentIds = attachments.map(
          attachment => attachment.id,
        );
      }
      await conversationRepository.update(
        { id: conversation.id, tenant_id: tenantId },
        { lastMessageAt: new Date(), lastMessageData },
      );

      const reads = conversation.participants.map(participant =>
        messageReadRepository.create({
          message: savedMessage,
          reader: participant,
          isRead: participant.id === senderId,
          isReceive: participant.id === senderId,
          tenant_id: tenantId,
        }),
      );
      await messageReadRepository.save(reads);

      const finalMessage = await messageRepository.findOne({
        where: { id: savedMessage.id, tenant_id: tenantId },
        relations: [
          'sender',
          'sender.user',
          'conversation',
          'reads',
          'attachments',
        ],
      });
      return plainToInstance(MessageResponseDto, finalMessage);
    });
  }

  async uploadAttachments(
    senderId: number,
    conversationId: number,
    files: Express.Multer.File[]
  ): Promise<number[]> {
    const conversation = await this.getParticipantConversation(
      conversationId,
      senderId,
    );
    const uploadedAttachments: StoredChatAttachment[] = [];
    try {
      for (const file of files) {
        uploadedAttachments.push(await this.attachmentStorage.store(file));
      }
    } catch (error) {
      await Promise.all(
        uploadedAttachments.map(item =>
          this.attachmentStorage.remove(item.storageKey).catch(() => undefined),
        ),
      );
      throw error;
    }

    if (!uploadedAttachments.length) {
      return [];
    }

    // créer les entités
    const attachments = uploadedAttachments.map(fileInfo =>
      this.attachmentRepository.create({
        ...fileInfo,
        fileType: fileInfo.fileType as AttachmentType,
        securityStatus: ChatAttachmentSecurityStatus.CLEAN,
        conversationId: conversation.id,
        uploadedById: senderId,
      })
    );

    // ⚠️ save retourne les entités AVEC leurs ids
    let savedAttachments: Attachment[];
    try {
      savedAttachments = await this.attachmentRepository.save(attachments);
    } catch (error) {
      await Promise.all(
        uploadedAttachments.map(item =>
          this.attachmentStorage.remove(item.storageKey).catch(() => undefined),
        ),
      );
      throw error;
    }

    // ✅ extraire les ids
    return savedAttachments.map(att => att.id);
  }

  async downloadAttachment(
    attachmentId: number,
    userId: number,
    context: {
      ip?: string | null;
      userAgent?: string | null;
      requestId?: string | null;
    } = {},
  ): Promise<{
    buffer: Buffer;
    fileName: string;
    mimeType: string;
  }> {
    const attachment = await this.attachmentRepository.findOne({
      where: {
        id: Number(attachmentId),
        tenant_id: getCurrentTenantId(),
      },
    });
    if (
      !attachment?.storageKey ||
      !attachment.conversationId ||
      attachment.securityStatus !== ChatAttachmentSecurityStatus.CLEAN
    ) {
      throw new NotFoundException('Pièce jointe introuvable');
    }
    const conversation = await this.getParticipantConversation(
      attachment.conversationId,
      userId,
    );
    const buffer = await this.attachmentStorage
      .read(attachment.storageKey)
      .catch(() => {
        throw new NotFoundException('Pièce jointe introuvable');
      });
    const hash = createHash('sha256').update(buffer).digest('hex');
    if (!attachment.sha256 || hash !== attachment.sha256) {
      buffer.fill(0);
      throw new BadRequestException(
        'Intégrité de la pièce jointe impossible à vérifier.',
      );
    }

    await this.dataSource.transaction(manager =>
      this.auditService.append(manager, {
        actorId: userId,
        action: 'chat.attachment.downloaded',
        resourceType: 'Attachment',
        resourceId: attachment.id,
        dossierId: (conversation as any).dossier?.id ?? null,
        afterState: {
          conversationId: conversation.id,
          sha256: attachment.sha256,
          size: attachment.fileSize,
        },
        ip: context.ip ?? null,
        userAgent: context.userAgent ?? null,
        requestId: context.requestId ?? null,
      }),
    );

    return {
      buffer,
      fileName: attachment.originalName || attachment.fileName,
      mimeType: attachment.detectedMime || attachment.mimeType || 'application/octet-stream',
    };
  }
  

  // private async validateFiles(files: Express.Multer.File[]): Promise<Express.Multer.File[]> {
  //   const maxSize = this.configService.get<number>('MAX_FILE_SIZE', 10 * 1024 * 1024); // 10MB par défaut
  //   const allowedMimeTypes = [
  //     'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  //     'application/pdf', 'application/msword',
  //     'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  //     'application/vnd.ms-excel',
  //     'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  //     'text/plain', 'text/csv'
  //   ];

  //   for (const file of files) {
  //     if (file.size > maxSize) {
  //       throw new BadRequestException(
  //         `Le fichier ${file.originalname} dépasse la taille maximale de ${maxSize / 1024 / 1024}MB`
  //       );
  //     }

  //     if (!allowedMimeTypes.includes(file.mimetype)) {
  //       throw new BadRequestException(
  //         `Le type de fichier ${file.mimetype} n'est pas autorisé pour ${file.originalname}`
  //       );
  //     }
  //   }

  //   return files;
  // }


async getUserConversations(userId: number): Promise<Conversation[]> {
  const tenantId = getCurrentTenantId();
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
    .andWhere('conversation.tenant_id = :tenantId', { tenantId })
    .orderBy('conversation.lastMessageAt', 'DESC')
    .getMany();

  // Récupérer les derniers messages avec leurs pièces jointes
  const conversationIds = conversations.map(c => c.id);
  
  if (conversationIds.length === 0) {
    return plainToInstance(Conversation, conversations, {
      excludeExtraneousValues: false,
    });
  }

  // Requête corrigée - ne pas utiliser la notation pointée dans select
  const lastMessages = await this.messageRepository
    .createQueryBuilder('message')
    .leftJoinAndSelect('message.attachments', 'attachments')
    .leftJoin('message.sender', 'sender')
    .leftJoin('sender.user', 'user')
    .addSelect([
      // Sélectionner les colonnes de sender
      'sender.id',
      // Sélectionner les colonnes de user
      'user.id',
      'user.first_name',
      'user.last_name',
      'user.username'
    ])
    .where('message.conversationId IN (:...ids)', { ids: conversationIds })
    .andWhere('message.tenant_id = :tenantId', { tenantId })
    .andWhere(qb => {
      const subQuery = qb.subQuery()
        .select('MAX(m.createdAt)')
        .from('message', 'm')
        .where('m.conversationId = message.conversationId')
        .getQuery();
      return 'message.createdAt = ' + subQuery;
    })
    .getMany();

  // Créer un map des derniers messages par conversation
  const lastMessagesMap = new Map();
  lastMessages.forEach(msg => {
    lastMessagesMap.set(msg.conversationId, msg);
  });

  // Enrichir les conversations avec les données du dernier message
  const enrichedConversations = conversations.map(conv => {
    const lastMsg = lastMessagesMap.get(conv.id);
    
    if (lastMsg) {
      // Construire le nom complet de l'expéditeur
      let senderName = 'Utilisateur';
      if (lastMsg.sender?.user) {
        const user = lastMsg.sender.user;
        if (user.first_name && user.last_name) {
          senderName = `${user.first_name} ${user.last_name}`;
        } else if (user.username) {
          senderName = user.username;
        }
      }

      // Traiter les pièces jointes
      const attachments = lastMsg.attachments || [];
      const hasAttachments = attachments.length > 0;
      const attachmentsTypes = hasAttachments 
        ? [...new Set(attachments.map(a => a.mimeType || a.type).filter(Boolean))]
        : [];
      const attachmentIds = attachments.map(a => a.id).filter(Boolean);

      // Ajouter les données du dernier message à la conversation
      Object.assign(conv, {
        lastMessageData: {
          content: lastMsg.content || '',
          createdAt: lastMsg.createdAt.toISOString(),
          senderId: lastMsg.sender?.id,
          senderName: senderName,
          hasAttachments: hasAttachments,
          attachmentsCount: attachments.length,
          attachmentsTypes: attachmentsTypes,
          attachmentIds: attachmentIds,
          referencesCount: lastMsg.references?.length || 0,
        }
      });
    }

    return conv;
  });

  return plainToInstance(Conversation, enrichedConversations, {
    excludeExtraneousValues: false,
  });
}
  async getConversationMessages(
    conversationId: number,
    userId: number,
  ): Promise<Message[]> {
    await this.getParticipantConversation(conversationId, userId);
    return this.messageRepository.find({
      where: {
        conversation: { id: conversationId },
        tenant_id: getCurrentTenantId(),
      },
      relations: [
        'sender',
        'sender.user',
        'attachments',
        'reads',
        'reads.reader',
      ],
      order: { createdAt: 'ASC' },
    });
  }

  async getConversation(conversationId: number, userId: number) {
    await this.getParticipantConversation(conversationId, userId);
    const tenantId = getCurrentTenantId();
    const conversation = await this.conversationRepository
      .createQueryBuilder('conversation')
      .leftJoinAndSelect('conversation.participants', 'participant')
      .leftJoinAndSelect('participant.user', 'user')
      .leftJoinAndSelect('conversation.messages', 'message')
      .leftJoinAndSelect('message.sender', 'sender')
      .leftJoinAndSelect('message.attachments', 'attachments')
      .leftJoinAndSelect('message.reads', 'reads')
      .leftJoinAndSelect('reads.reader', 'reader')
      .leftJoinAndSelect('sender.user', 'senderUser')
      .addSelect(['reads.id', 'reads.isRead', 'reads.readAt', 'reader.id'])
      .where('conversation.id = :id', { id: conversationId })
      .andWhere('conversation.tenant_id = :tenantId', { tenantId })
      .getOne();

    if (!conversation) {
      throw new NotFoundException('Conversation non trouvée');
    }

    if (conversation.messages) {
      conversation.messages.forEach(message => {
        if (message.reads) {
          message.reads = message.reads.map(read => ({
            ...read,
            reader: read.reader?.id,
          })) as any;
        }
      });
    }

    return plainToInstance(Conversation, conversation, {
      excludeExtraneousValues: false,
    });
  }

  async getParticipantIdsExcluding(
    conversationId: number,
    requesterId: number,
  ): Promise<number[]> {
    const conversation = await this.getParticipantConversation(
      conversationId,
      requesterId,
    );
    return conversation.participants
      .filter(participant => participant.id !== requesterId)
      .map(participant => participant.id);
  }

  async markMessagesAsRead(
    conversationId: number,
    userId: number,
  ): Promise<number | undefined> {
    return this.updateMessageReceipt(conversationId, userId, 'read');
  }

  async markMessagesAsReceive(
    conversationId: number,
    userId: number,
  ): Promise<number | undefined> {
    return this.updateMessageReceipt(conversationId, userId, 'receive');
  }

  private async updateMessageReceipt(
    conversationId: number,
    userId: number,
    kind: 'read' | 'receive',
  ): Promise<number | undefined> {
    await this.getParticipantConversation(conversationId, userId);
    const tenantId = getCurrentTenantId();
    const messages = await this.messageRepository.find({
      where: {
        conversation: { id: conversationId },
        tenant_id: tenantId,
      },
      select: ['id'],
      order: { createdAt: 'DESC' },
    });
    const messageIds = messages.map(message => message.id);
    if (!messageIds.length) return undefined;

    const update = this.messageReadRepository
      .createQueryBuilder()
      .update(MessageRead)
      .set(
        kind === 'read'
          ? { isRead: true, readAt: new Date() }
          : { isReceive: true },
      )
      .where('readerId = :userId', { userId })
      .andWhere('tenant_id = :tenantId', { tenantId })
      .andWhere(`${kind === 'read' ? 'isRead' : 'isReceive'} = false`)
      .andWhere('messageId IN (:...messageIds)', { messageIds });
    await update.execute();
    return messageIds[0];
  }

  async setReceiveMessagesWithCount(
    userId: number,
  ): Promise<{ updated: number }> {
    const tenantId = getCurrentTenantId();
    const result = await this.messageReadRepository
      .createQueryBuilder()
      .update(MessageRead)
      .set({ isReceive: true })
      .where('readerId = :userId', { userId })
      .andWhere('tenant_id = :tenantId', { tenantId })
      .andWhere('isReceive = :isReceive', { isReceive: false })
      .execute();

    return { updated: result.affected || 0 };
  }

}
