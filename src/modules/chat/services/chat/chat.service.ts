// src/chat/services/chat.service.ts
import {
  Employee,
  EmployeeStatus,
} from 'src/modules/agencies/employee/entities/employee.entity';
import { addTenantCondition } from 'src/core/tenant/tenant-repository.patch';
import { getCurrentTenantId } from 'src/core/tenant/tenant.context';
import { conversationTypeBackfill } from '../../conversation-type.backfill';
import { In, Repository } from 'typeorm';
import {
  BadRequestException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ChatTranscriptionService } from './chat-transcription.service';

import { InjectRepository } from '@nestjs/typeorm';

import {
  CreateConversationDto,
  SendMessageDto,
  CreateGroupDto,
  ChatReferenceDto,
} from '../../dto/create-conversation.dto';
import {
  Conversation,
  ConversationType,
} from '../../entities/conversation.entity';
import { Message } from '../../entities/messages.entity';
import { MessageRead } from '../../entities/message-read.entity';
import { EmployeeService } from 'src/modules/agencies/employee/employee.service';
import { Attachment } from '../../entities/attachment.entity';
import { FilesUtil } from 'src/core/shared/utils/file.util';
import { UPLOAD_DOCS_PATH } from 'src/core/common/constants/constants';

/** Taille maximale d'une pièce jointe (alignée sur la limite multer). */
export const CHAT_MAX_FILE_SIZE = 50 * 1024 * 1024;

/** Types MIME acceptés en pièce jointe du chat. */
const ALLOWED_MIME_PREFIXES = ['image/', 'video/', 'audio/', 'text/'];
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/rtf',
  'application/zip',
  'application/x-zip-compressed',
  'application/octet-stream',
]);

const MESSAGES_PAGE_SIZE = 50;

export type LastMessageStatus = 'sent' | 'delivered' | 'read';

/** Collaborateur réduit aux champs affichables (jamais de jeton ni de hash). */
export interface ChatEmployee {
  id: number;
  full_name?: string;
  username?: string;
  is_online?: boolean;
  lastSeen?: string | null;
  position?: string;
  status?: number;
  user?: {
    id: number;
    username?: string;
    email?: string;
    first_name?: string;
    last_name?: string;
    full_name?: string;
    is_online?: boolean;
    lastSeen?: string | null;
  };
}

export function toChatEmployee(employee?: Employee | null): ChatEmployee {
  if (!employee) return { id: 0 };
  const user = employee.user;
  return {
    id: employee.id,
    full_name: user?.full_name || '',
    username: user?.username,
    is_online: !!user?.is_online,
    lastSeen: user?.lastSeen ?? null,
    position: employee.position,
    status: employee.status,
    user: user
      ? {
          id: user.id,
          username: user.username,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
          full_name: user.full_name,
          is_online: user.is_online,
          lastSeen: user.lastSeen ?? null,
        }
      : undefined,
  };
}

/** Message tel qu'envoyé au front (HTTP et socket). */
export interface ChatMessagePayload {
  id: number;
  content: string;
  conversationId: number;
  createdAt: Date;
  sender: ChatEmployee;
  sender_name: string;
  hasAttachments: boolean;
  attachments: Attachment[];
  references: ChatReferenceDto[];
  reads: Array<{
    id: number;
    reader: number;
    isRead: boolean;
    isReceive: boolean;
    readAt: Date;
  }>;
  isRead: boolean;
  clientTempId?: string;
}

/** Conversation telle qu'affichée dans la liste du front. */
export type ConversationSummary = {
  id: number;
  name: string;
  isGroup: boolean;
  type: ConversationType;
  createdAt: Date;
  lastMessageAt: Date;
  lastMessageData?: Conversation['lastMessageData'];
  participants: ChatEmployee[];
  lastMessage?: Conversation['lastMessageData'];
  unreadCount: number;
  dossier?: {
    id: number;
    dossier_number: string;
    object: string | null;
    status: number;
    is_closed: boolean;
  };
};

/** Accusés modifiés pour un lecteur : par conversation, les messages concernés. */
export interface ReceiptUpdate {
  conversationId: number;
  messageIds: number[];
  at: string;
}

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
    @Optional()
    @Inject(forwardRef(() => ChatTranscriptionService))
    private readonly transcriptionService?: ChatTranscriptionService,
  ) {}

  private sanitizeReferences(
    references?: ChatReferenceDto[],
  ): ChatReferenceDto[] {
    if (!Array.isArray(references)) return [];

    const cleanText = (value: unknown): string =>
      String(value ?? '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/\s+/g, ' ')
        .trim();

    const allowedMetaKeys = new Set([
      'reference',
      'numero',
      'email',
      'phone',
      'date',
    ]);
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
      .filter(
        (ref) =>
          ref &&
          ref.type &&
          allowedTypes.has(String(ref.type).toLowerCase()) &&
          ref.id !== undefined &&
          ref.id !== null &&
          ref.label,
      )
      .slice(0, 10)
      .map((ref) => {
        const type = String(ref.type).toLowerCase();
        const meta: NonNullable<ChatReferenceDto['meta']> = {};
        if (ref.meta && typeof ref.meta === 'object') {
          for (const [key, value] of Object.entries(ref.meta)) {
            if (
              !allowedMetaKeys.has(key) ||
              value === undefined ||
              value === null
            )
              continue;
            meta[key as keyof NonNullable<ChatReferenceDto['meta']>] =
              cleanText(value).slice(0, 200);
          }
        }

        const clean: ChatReferenceDto = {
          type: type.slice(0, 50),
          id: typeof ref.id === 'number' ? ref.id : String(ref.id).slice(0, 80),
          label: cleanText(ref.label).slice(0, 200),
        };

        if (ref.href && String(ref.href).startsWith('/'))
          clean.href = String(ref.href).slice(0, 500);
        if (Object.keys(meta).length) clean.meta = meta;
        return clean;
      });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // ACCÈS
  // ────────────────────────────────────────────────────────────────────────────

  /** true si l'employé est participant de la conversation (cabinet courant). */
  async isParticipant(
    conversationId: number,
    userId: number,
  ): Promise<boolean> {
    if (!conversationId || !userId) return false;
    const qb = this.conversationRepository
      .createQueryBuilder('conversation')
      .innerJoin(
        'conversation.participants',
        'participant',
        'participant.id = :userId',
        { userId: Number(userId) },
      )
      .where('conversation.id = :id', { id: Number(conversationId) });
    addTenantCondition(qb, 'conversation');
    return (await qb.getCount()) > 0;
  }

  /**
   * Refuse l'accès à une conversation dont l'appelant n'est pas (ou plus)
   * participant : un membre retiré d'un dossier perd ainsi lecture et écriture.
   */
  async assertParticipant(
    conversationId: number,
    userId: number,
  ): Promise<void> {
    if (!(await this.isParticipant(conversationId, userId))) {
      throw new ForbiddenException(
        'Vous ne faites pas partie de cette conversation.',
      );
    }
  }

  async getDossierConversationId(dossierId: number): Promise<number | null> {
    if (!dossierId) return null;
    const qb = this.conversationRepository
      .createQueryBuilder('conversation')
      .innerJoin('conversation.dossier', 'dossier', 'dossier.id = :dossierId', {
        dossierId,
      })
      .select('conversation.id', 'id');
    addTenantCondition(qb, 'conversation');
    const row = await qb.getRawOne<{ id: number }>();
    return row?.id ? Number(row.id) : null;
  }

  async getParticipantIds(conversationId: number): Promise<number[]> {
    const rows = await this.conversationRepository
      .createQueryBuilder()
      .relation(Conversation, 'participants')
      .of(conversationId)
      .loadMany<Employee>();
    return rows.map((p) => p.id);
  }

  async getParticipantIdsExcluding(
    conversationId: number,
    excludeUserId: number,
  ): Promise<number[]> {
    const ids = await this.getParticipantIds(conversationId);
    return ids.filter((id) => id !== excludeUserId);
  }

  /** Reclasse les conversations du cabinet courant (global, dossier, direct). */
  async normalizeConversationTypes(): Promise<void> {
    for (const sql of conversationTypeBackfill('c.`tenant_id` = ?')) {
      await this.conversationRepository.query(sql, [getCurrentTenantId()]);
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // CRÉATION
  // ────────────────────────────────────────────────────────────────────────────

  private async findActiveEmployees(ids: number[]): Promise<Employee[]> {
    const unique = [...new Set(ids.map(Number).filter(Boolean))];
    if (!unique.length) return [];
    const employees = await this.userRepository.find({
      where: { id: In(unique) },
    });
    return employees.filter(
      (e) =>
        e.status !== EmployeeStatus.INACTIVE &&
        e.status !== EmployeeStatus.SUSPENDED,
    );
  }

  async createConversation(
    dto: CreateConversationDto,
    creatorId: number,
  ): Promise<Conversation> {
    const others = (dto.participantIds ?? [])
      .map(Number)
      .filter((id) => id && id !== Number(creatorId));
    if (!dto.isGroup && !dto.name && others.length === 1) {
      return this.findOrCreateDirect(creatorId, others[0]);
    }
    return this.createGroup(
      { name: dto.name?.trim() || 'Nouveau groupe', participantIds: others },
      creatorId,
    );
  }

  /**
   * Conversation directe (non groupe) entre deux collaborateurs : la
   * conversation existante, sinon une nouvelle.
   */
  async findOrCreateDirect(
    creatorId: number,
    otherId: number,
  ): Promise<Conversation> {
    if (Number(creatorId) === Number(otherId)) {
      throw new BadRequestException(
        'Impossible de vous envoyer un message à vous-même.',
      );
    }
    const qb = this.conversationRepository
      .createQueryBuilder('c')
      .innerJoin('c.participants', 'p')
      .select('c.id', 'id')
      .where('c.isGroup = :group', { group: false })
      .groupBy('c.id')
      .having('COUNT(DISTINCT p.id) = 2')
      .andHaving('SUM(CASE WHEN p.id IN (:...ids) THEN 1 ELSE 0 END) = 2', {
        ids: [Number(creatorId), Number(otherId)],
      })
      .orderBy('c.id', 'DESC')
      .limit(1);
    addTenantCondition(qb, 'c');
    const rows: Array<{ id: number }> = await qb.getRawMany();
    if (rows[0]?.id) {
      const existing = await this.conversationRepository.findOne({
        where: { id: Number(rows[0].id) },
      });
      if (existing) return existing;
    }

    const participants = await this.findActiveEmployees([creatorId, otherId]);
    if (participants.length !== 2) {
      throw new NotFoundException('Collaborateur introuvable ou inactif.');
    }
    return this.conversationRepository.save(
      this.conversationRepository.create({
        isGroup: false,
        type: ConversationType.DIRECT,
        participants,
      }),
    );
  }

  async createGroup(
    dto: CreateGroupDto,
    creatorId: number,
  ): Promise<Conversation> {
    const participants = await this.findActiveEmployees([
      creatorId,
      ...(dto.participantIds ?? []),
    ]);
    if (participants.length < 2) {
      throw new BadRequestException(
        'Un groupe doit compter au moins un autre membre.',
      );
    }

    return this.conversationRepository.save(
      this.conversationRepository.create({
        name: dto.name,
        isGroup: true,
        type: ConversationType.GROUP,
        participants,
      }),
    );
  }

  // ────────────────────────────────────────────────────────────────────────────
  // ENVOI
  // ────────────────────────────────────────────────────────────────────────────

  async sendMessage(
    dto: SendMessageDto,
    senderId: number,
  ): Promise<ChatMessagePayload> {
    return this.sendMessageWithExistingAttachments(dto, senderId);
  }

  async sendMessageWithAttachments(
    dto: SendMessageDto,
    senderId: number,
    files: Express.Multer.File[],
  ): Promise<ChatMessagePayload> {
    if (!dto.content?.trim() && files.length === 0) {
      throw new BadRequestException(
        'Un message doit avoir du contenu ou des pièces jointes',
      );
    }
    await this.assertParticipant(dto.conversationId, senderId);
    const ids = await this.uploadAttachments(senderId, files);
    return this.sendMessageWithExistingAttachments(
      { ...dto, attachmentIds: ids },
      senderId,
    );
  }

  async sendMessageWithExistingAttachments(
    dto: SendMessageDto,
    senderId: number,
  ): Promise<ChatMessagePayload> {
    const conversationId = Number(dto.conversationId);
    const attachmentIds = (dto.attachmentIds ?? []).map(Number);
    const references = this.sanitizeReferences(dto.references);
    const content = (dto.content ?? '').trim();
    if (!content && attachmentIds.length === 0) {
      throw new BadRequestException(
        'Un message doit avoir du contenu ou des pièces jointes',
      );
    }

    await this.assertParticipant(conversationId, senderId);

    const sender = await this.userService.findOne(senderId);
    if (!sender) {
      throw new NotFoundException(
        `Utilisateur avec l'ID ${senderId} non trouvé`,
      );
    }

    // Seules les pièces téléversées par l'expéditeur et pas encore envoyées
    // peuvent être jointes : un identifiant ne permet pas de détourner le
    // fichier d'un autre collaborateur.
    let attachments: Attachment[] = [];
    if (attachmentIds.length > 0) {
      attachments = await this.attachmentRepository.find({
        where: { id: In(attachmentIds) },
        relations: ['message'],
      });
      const usable = attachments.filter(
        (a) => !a.message && Number(a.uploadedById) === Number(senderId),
      );
      if (usable.length !== attachmentIds.length) {
        throw new BadRequestException(
          'Certaines pièces jointes sont introuvables ou déjà envoyées.',
        );
      }
    }

    const savedMessage = await this.messageRepository.save(
      this.messageRepository.create({
        content,
        sender,
        conversation: { id: conversationId } as Conversation,
        conversationId,
        hasAttachments: attachments.length > 0,
        references,
      }),
    );

    if (attachments.length > 0) {
      await this.attachmentRepository.update(
        { id: In(attachments.map((a) => a.id)) },
        { message: { id: savedMessage.id } as Message },
      );
    }

    // Une ligne d'accusé par participant : l'expéditeur a lu son message.
    const participantIds = await this.getParticipantIds(conversationId);
    await this.messageReadRepository.save(
      participantIds.map((id) =>
        this.messageReadRepository.create({
          message: { id: savedMessage.id } as Message,
          reader: { id } as Employee,
          isRead: id === senderId,
          isReceive: id === senderId,
        }),
      ),
    );

    const now = new Date();
    await this.conversationRepository.update(conversationId, {
      lastMessageAt: now,
      lastMessageData: {
        messageId: savedMessage.id,
        content: content || (attachments.length ? '📎 Pièce jointe' : ''),
        createdAt: now.toISOString(),
        senderId,
        senderName:
          sender.user?.full_name || sender.user?.username || 'Utilisateur',
        referencesCount: references.length,
        hasAttachments: attachments.length > 0,
        attachmentsCount: attachments.length,
        attachmentsTypes: [
          ...new Set(attachments.map((a) => a.mimeType).filter(Boolean)),
        ],
        attachmentIds: attachments.map((a) => a.id),
        status: participantIds.length > 1 ? 'sent' : 'read',
      },
    });

    const payload = await this.getMessagePayload(savedMessage.id);
    return { ...payload, clientTempId: dto.clientTempId };
  }

  async uploadAttachments(
    senderId: number,
    files: Express.Multer.File[],
  ): Promise<number[]> {
    this.validateFiles(files);
    const uploadedAttachments = (await FilesUtil.uploadFiles(
      files,
      UPLOAD_DOCS_PATH,
      'docType.mimetype',
      {
        maxSizeKB: 300, // recompression des images uniquement
        quality: 70,
      },
    )) as unknown as Array<Partial<Attachment>>;

    if (!uploadedAttachments.length) {
      return [];
    }

    const savedAttachments = await this.attachmentRepository.save(
      uploadedAttachments.map((fileInfo) =>
        this.attachmentRepository.create({
          ...fileInfo,
          isUploaded: true,
          uploadedById: Number(senderId),
        }),
      ),
    );

    // Vocaux : transcription en arrière-plan (file Bull).
    await this.transcriptionService
      ?.schedule(savedAttachments)
      .catch((err) =>
        new Logger(ChatService.name).warn(
          `Transcription non planifiée : ${err?.message}`,
        ),
      );

    return savedAttachments.map((att) => att.id);
  }

  private validateFiles(files: Express.Multer.File[]): void {
    for (const file of files ?? []) {
      if (file.size > CHAT_MAX_FILE_SIZE) {
        throw new BadRequestException(
          `Le fichier ${file.originalname} dépasse la taille maximale de 50 Mo.`,
        );
      }
      const mime = (file.mimetype || '').toLowerCase();
      const allowed =
        ALLOWED_MIME_TYPES.has(mime) ||
        ALLOWED_MIME_PREFIXES.some((prefix) => mime.startsWith(prefix));
      if (!allowed) {
        throw new BadRequestException(
          `Le type de fichier ${file.mimetype} n'est pas autorisé (${file.originalname}).`,
        );
      }
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // LECTURE
  // ────────────────────────────────────────────────────────────────────────────

  private messagesQuery() {
    return this.messageRepository
      .createQueryBuilder('message')
      .leftJoinAndSelect('message.sender', 'sender')
      .leftJoinAndSelect('sender.user', 'senderUser')
      .leftJoinAndSelect('message.attachments', 'attachments')
      .leftJoinAndSelect('message.reads', 'reads')
      .leftJoin('reads.reader', 'reader')
      .addSelect('reader.id');
  }

  /** Forme commune d'un message pour le front : `reader` réduit à son id. */
  private toPayload(message: Message): ChatMessagePayload {
    return {
      id: message.id,
      content: message.content,
      conversationId: message.conversationId,
      createdAt: message.createdAt,
      sender: toChatEmployee(message.sender),
      sender_name: message.sender?.user?.full_name || '',
      hasAttachments: message.hasAttachments,
      attachments: message.attachments ?? [],
      references: message.references ?? [],
      reads: (message.reads ?? []).map((read) => ({
        id: read.id,
        reader: read.reader?.id,
        isRead: read.isRead,
        isReceive: read.isReceive,
        readAt: read.readAt,
      })),
      isRead: (message.reads ?? []).every((r) => r.isRead),
    };
  }

  async getMessagePayload(messageId: number): Promise<ChatMessagePayload> {
    const message = await this.messagesQuery()
      .where('message.id = :id', { id: messageId })
      .getOne();
    if (!message) {
      throw new NotFoundException('Le message enregistré est introuvable');
    }
    return this.toPayload(message);
  }

  /**
   * Conversations de l'utilisateur (ou une seule avec `conversationId`), avec
   * le nombre de non-lus, le dernier message et le dossier lié.
   */
  async getUserConversations(
    userId: number,
    conversationId?: number,
  ): Promise<ConversationSummary[]> {
    const conversationsQB = this.conversationRepository
      .createQueryBuilder('conversation')
      .leftJoinAndSelect('conversation.participants', 'participant')
      .leftJoinAndSelect('participant.user', 'user')
      .leftJoin('conversation.dossier', 'dossier')
      .addSelect([
        'dossier.id',
        'dossier.dossier_number',
        'dossier.object',
        'dossier.status',
        'dossier.is_archived',
        'dossier.workflow_engine',
        'dossier.lifecycle_phase',
      ])
      .loadRelationCountAndMap(
        'conversation.unreadCount',
        'conversation.messages',
        'unreadMessages',
        (qb) =>
          qb
            .innerJoin('unreadMessages.reads', 'read')
            .where('read.readerId = :userId', { userId })
            .andWhere('read.isRead = :isRead', { isRead: false }),
      )
      .where(
        'EXISTS (SELECT 1 FROM conversation_participants_employee cp WHERE cp.conversationId = conversation.id AND cp.employeeId = :userId)',
        { userId },
      )
      .orderBy('conversation.lastMessageAt', 'DESC');
    if (conversationId) {
      conversationsQB.andWhere('conversation.id = :conversationId', {
        conversationId,
      });
    }
    // Isolation multi-tenant : limite aux conversations du cabinet courant.
    addTenantCondition(conversationsQB, 'conversation');
    const conversations = await conversationsQB.getMany();

    return conversations.map((conv) => this.toSummary(conv));
  }

  async getConversationSummaryFor(
    userId: number,
    conversationId: number,
  ): Promise<ConversationSummary | null> {
    const [summary] = await this.getUserConversations(userId, conversationId);
    return summary ?? null;
  }

  /** Objet simple (sérialisable tel quel sur le socket). */
  private toSummary(conv: Conversation): ConversationSummary {
    const dossier = conv.dossier;
    return {
      id: conv.id,
      name: conv.name,
      isGroup: conv.isGroup,
      type: conv.type,
      createdAt: conv.createdAt,
      lastMessageAt: conv.lastMessageAt,
      lastMessageData: conv.lastMessageData,
      participants: (conv.participants ?? []).map(toChatEmployee),
      lastMessage: conv.lastMessageData ?? undefined,
      unreadCount: Number((conv as any).unreadCount ?? 0),
      dossier: dossier
        ? {
            id: dossier.id,
            dossier_number: dossier.dossier_number,
            object: dossier.object,
            status: dossier.status,
            is_closed: !!(dossier.is_closed || dossier.is_archived),
          }
        : undefined,
    };
  }

  /**
   * Page de messages (du plus ancien au plus récent) antérieurs à `before`.
   */
  async getConversationMessages(
    conversationId: number,
    userId: number,
    options: { before?: number; limit?: number } = {},
  ): Promise<{ messages: ChatMessagePayload[]; hasMore: boolean }> {
    await this.assertParticipant(conversationId, userId);
    const limit = Math.min(
      Math.max(Number(options.limit) || MESSAGES_PAGE_SIZE, 1),
      100,
    );

    // Les ids sont paginés seuls : une jointure sur reads/attachments
    // fausserait la limite.
    const idsQB = this.messageRepository
      .createQueryBuilder('message')
      .select('message.id', 'id')
      .where('message.conversationId = :conversationId', { conversationId })
      .orderBy('message.id', 'DESC')
      .limit(limit + 1);
    if (options.before) {
      idsQB.andWhere('message.id < :before', { before: Number(options.before) });
    }
    addTenantCondition(idsQB, 'message');
    const ids = (await idsQB.getRawMany<{ id: number }>()).map((r) =>
      Number(r.id),
    );
    const hasMore = ids.length > limit;
    const pageIds = ids.slice(0, limit);
    if (!pageIds.length) return { messages: [], hasMore: false };

    const messages = await this.messagesQuery()
      .where('message.id IN (:...ids)', { ids: pageIds })
      .orderBy('message.id', 'ASC')
      .getMany();

    return { messages: messages.map((m) => this.toPayload(m)), hasMore };
  }

  /** En-tête de la conversation + dernière page de messages. */
  async getConversation(conversationId: number, userId: number) {
    const summary = await this.getConversationSummaryFor(
      userId,
      conversationId,
    );
    if (!summary) {
      const exists = await this.conversationRepository.exists({
        where: { id: conversationId },
      });
      if (exists) {
        throw new ForbiddenException(
          'Vous ne faites pas partie de cette conversation.',
        );
      }
      throw new NotFoundException('Conversation non trouvée');
    }
    const page = await this.getConversationMessages(conversationId, userId);
    return { ...summary, messages: page.messages, hasMore: page.hasMore };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // ACCUSÉS DE RÉCEPTION ET DE LECTURE
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Passe à « lu » (et donc « reçu ») les messages de la conversation que
   * l'utilisateur n'avait pas encore lus. Ne touche qu'aux lignes de ce
   * lecteur et renvoie les messages concernés.
   */
  async markMessagesAsRead(
    conversationId: number,
    userId: number,
  ): Promise<ReceiptUpdate | null> {
    await this.assertParticipant(conversationId, userId);
    const rows = await this.pendingReceipts(userId, 'isRead', conversationId);
    if (!rows.length) return null;

    const at = new Date();
    await this.messageReadRepository.update(
      { id: In(rows.map((r) => r.readId)) },
      { isRead: true, isReceive: true, readAt: at },
    );
    await this.refreshLastMessageStatus(conversationId);
    return {
      conversationId,
      messageIds: rows.map((r) => r.messageId),
      at: at.toISOString(),
    };
  }

  /** Passe à « reçu » les messages d'une conversation pour ce lecteur. */
  async markMessagesAsReceive(
    conversationId: number,
    userId: number,
  ): Promise<ReceiptUpdate | null> {
    await this.assertParticipant(conversationId, userId);
    const [update] = await this.markReceived(userId, conversationId);
    return update ?? null;
  }

  /**
   * À la connexion : tout ce qui attendait l'utilisateur est désormais
   * « reçu ». Renvoie les mises à jour par conversation pour prévenir les
   * expéditeurs.
   */
  async setReceiveMessagesWithCount(userId: number): Promise<ReceiptUpdate[]> {
    return this.markReceived(userId);
  }

  private async markReceived(
    userId: number,
    conversationId?: number,
  ): Promise<ReceiptUpdate[]> {
    const rows = await this.pendingReceipts(userId, 'isReceive', conversationId);
    if (!rows.length) return [];

    const at = new Date();
    await this.messageReadRepository.update(
      { id: In(rows.map((r) => r.readId)) },
      { isReceive: true },
    );

    const byConversation = new Map<number, number[]>();
    for (const row of rows) {
      const list = byConversation.get(row.conversationId) ?? [];
      list.push(row.messageId);
      byConversation.set(row.conversationId, list);
    }
    const updates: ReceiptUpdate[] = [];
    for (const [convId, messageIds] of byConversation) {
      await this.refreshLastMessageStatus(convId);
      updates.push({
        conversationId: convId,
        messageIds,
        at: at.toISOString(),
      });
    }
    return updates;
  }

  private async pendingReceipts(
    userId: number,
    flag: 'isRead' | 'isReceive',
    conversationId?: number,
  ): Promise<
    Array<{ readId: number; messageId: number; conversationId: number }>
  > {
    const qb = this.messageReadRepository
      .createQueryBuilder('read')
      .innerJoin('read.message', 'message')
      .select('read.id', 'readId')
      .addSelect('message.id', 'messageId')
      .addSelect('message.conversationId', 'conversationId')
      .where('read.readerId = :userId', { userId })
      .andWhere(`read.${flag} = :flag`, { flag: false });
    if (conversationId) {
      qb.andWhere('message.conversationId = :conversationId', {
        conversationId,
      });
    }
    addTenantCondition(qb, 'read');
    const rows = await qb.getRawMany();
    return rows.map((r) => ({
      readId: Number(r.readId),
      messageId: Number(r.messageId),
      conversationId: Number(r.conversationId),
    }));
  }

  /** Statut (envoyé / reçu / lu) du dernier message, affiché dans la liste. */
  private async refreshLastMessageStatus(
    conversationId: number,
  ): Promise<void> {
    const conversation = await this.conversationRepository.findOne({
      where: { id: conversationId },
      select: ['id', 'lastMessageData'],
    });
    const data = conversation?.lastMessageData;
    if (!data?.messageId) return;

    const reads = await this.messageReadRepository.find({
      where: { message: { id: data.messageId } },
      select: ['id', 'isRead', 'isReceive'],
    });
    if (!reads.length) return;
    const status: LastMessageStatus = reads.every((r) => r.isRead)
      ? 'read'
      : reads.every((r) => r.isReceive)
        ? 'delivered'
        : 'sent';
    if (status === data.status) return;
    await this.conversationRepository.update(conversationId, {
      lastMessageData: { ...data, status },
    });
  }
}
