// src/chat/controllers/chat.controller.ts
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseIntPipe,
  Query,
  Request,
  HttpStatus,
  Logger,
  UseInterceptors,
  UploadedFiles,
  UseGuards,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiBody,
  ApiConsumes,
  ApiQuery,
} from '@nestjs/swagger';
import {
  CreateConversationDto,
  CreateDirectConversationDto,
  CreateGroupDto,
  SendMessageDto,
} from '../../dto/create-conversation.dto';
import {
  ChatMessagePayload,
  ChatService,
} from '../../services/chat/chat.service';
import { Conversation } from '../../entities/conversation.entity';
import { FilesInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from 'src/core/decorators/current-user.decorator';
import { User } from 'src/modules/iam/user/entities/user.entity';
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { AllowClient } from 'src/core/decorators/allow-client.decorator';
import { MainGateway } from 'src/core/shared/services/socket/main.gateway';

@ApiTags('chat')
@Controller('chat')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ChatController {
  private readonly logger = new Logger(ChatController.name);

  constructor(
    private chatService: ChatService,
    private readonly moduleRef: ModuleRef,
  ) {}

  /** Gateway résolu à la demande (dépendance circulaire avec ChatService). */
  private get gateway(): MainGateway | null {
    try {
      return this.moduleRef.get(MainGateway, { strict: false });
    } catch {
      return null;
    }
  }

  /** Diffuse en temps réel un message envoyé par HTTP. */
  private async broadcast(
    message: ChatMessagePayload,
    senderId: number,
  ): Promise<ChatMessagePayload> {
    await this.gateway
      ?.broadcastChatMessage(message, senderId)
      .catch((err) =>
        this.logger.warn(`Diffusion du message ignorée : ${err?.message}`),
      );
    return message;
  }

  private async announceNewConversation(conversationId: number) {
    const gateway = this.gateway;
    if (!gateway) return;
    const participantIds =
      await this.chatService.getParticipantIds(conversationId);
    for (const id of participantIds) {
      const summary = await this.chatService.getConversationSummaryFor(
        id,
        conversationId,
      );
      if (summary) gateway.emitConversationAdded(id, summary);
    }
  }

  @Post('conversations')
  @ApiOperation({ summary: 'Créer une nouvelle conversation' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Conversation créée avec succès',
    type: Conversation,
  })
  @ApiBody({ type: CreateConversationDto })
  async createConversation(@Body() dto: CreateConversationDto, @Request() req) {
    const conversation = await this.chatService.createConversation(
      dto,
      req.user.id,
    );
    if (conversation.isGroup) await this.announceNewConversation(conversation.id);
    return this.chatService.getConversationSummaryFor(
      req.user.id,
      conversation.id,
    );
  }

  @Post('conversations/direct')
  @ApiOperation({
    summary: 'Ouvrir (ou créer) la discussion directe avec un collaborateur',
  })
  @ApiBody({ type: CreateDirectConversationDto })
  async openDirect(@Body() dto: CreateDirectConversationDto, @Request() req) {
    const conversation = await this.chatService.findOrCreateDirect(
      req.user.id,
      Number(dto.employeeId),
    );
    return this.chatService.getConversationSummaryFor(
      req.user.id,
      conversation.id,
    );
  }

  @Post('groups')
  @ApiOperation({ summary: 'Créer un nouveau groupe' })
  @ApiBody({ type: CreateGroupDto })
  async createGroup(@Body() dto: CreateGroupDto, @Request() req) {
    const group = await this.chatService.createGroup(dto, req.user.id);
    await this.announceNewConversation(group.id);
    return this.chatService.getConversationSummaryFor(req.user.id, group.id);
  }

  @Get('conversations')
  // Chargée par le ChatProvider global du front ; bornée aux conversations
  // dont l'appelant est participant (vide pour un client).
  @AllowClient()
  @ApiOperation({ summary: "Récupérer les conversations de l'utilisateur" })
  async getUserConversations(@Request() req) {
    return await this.chatService.getUserConversations(req.user.id);
  }

  @Get('conversations/:id/messages')
  @ApiOperation({
    summary: "Page de messages d'une conversation (plus récents d'abord)",
  })
  @ApiParam({ name: 'id', type: Number })
  @ApiQuery({ name: 'before', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getConversationMessages(
    @Param('id', ParseIntPipe) id: number,
    @Query('before') before: string | undefined,
    @Query('limit') limit: string | undefined,
    @Request() req,
  ) {
    return await this.chatService.getConversationMessages(id, req.user.id, {
      before: before ? Number(before) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('conversations/:id')
  @ApiOperation({
    summary: 'Récupérer une conversation et sa dernière page de messages',
  })
  @ApiParam({ name: 'id', type: Number })
  async getConversation(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return await this.chatService.getConversation(id, req.user.id);
  }

  @Post('messages')
  @ApiOperation({ summary: 'Envoyer un message (repli HTTP du socket)' })
  @ApiBody({ type: SendMessageDto })
  async sendMessage(@Body() dto: SendMessageDto, @Request() req) {
    const message = await this.chatService.sendMessage(dto, req.user.id);
    return this.broadcast(message, req.user.id);
  }

  @Post('send')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Send message with optional attachments',
    schema: {
      type: 'object',
      properties: {
        conversationId: { type: 'number' },
        content: { type: 'string' },
        attachments: {
          type: 'array',
          items: {
            type: 'string',
            format: 'binary',
          },
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Message envoyé avec succès' })
  @UseInterceptors(FilesInterceptor('attachments', 10)) // Max 10 fichiers
  async sendMessageWithFiles(
    @Body() dto: SendMessageDto,
    @CurrentUser() user: User,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    const message = await this.chatService.sendMessageWithAttachments(
      { ...dto, conversationId: Number(dto.conversationId) },
      user.id,
      files || [],
    );
    return this.broadcast(message, user.id);
  }

  @Post('send-with-attachement-ids')
  @ApiBody({ type: SendMessageDto })
  @ApiResponse({ status: 201, description: 'Message envoyé avec succès' })
  async sendMessageWithAttachementIds(
    @Body() dto: SendMessageDto,
    @CurrentUser() user: User,
  ) {
    const message = await this.chatService.sendMessageWithExistingAttachments(
      dto,
      user.id,
    );
    return this.broadcast(message, user.id);
  }

  @Post('upload/attachements')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Téléverse des pièces jointes (identifiants renvoyés)',
    schema: {
      type: 'object',
      properties: {
        attachments: {
          type: 'array',
          items: {
            type: 'string',
            format: 'binary',
          },
        },
      },
    },
  })
  @UseInterceptors(FilesInterceptor('attachments', 10)) // Max 10 fichiers
  async uploadFiles(
    @Request() req,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    return this.chatService.uploadAttachments(req.user.id, files || []);
  }

  @Post('conversations/:id/read')
  @ApiOperation({ summary: 'Marquer les messages comme lus' })
  @ApiParam({ name: 'id', type: Number })
  async markAsRead(@Param('id', ParseIntPipe) id: number, @Request() req) {
    const update = await this.chatService.markMessagesAsRead(id, req.user.id);
    if (update) {
      await this.gateway
        ?.emitReceipts(update, req.user.id, 'read')
        .catch(() => undefined);
    }
    return { success: true, messageIds: update?.messageIds ?? [] };
  }
}
