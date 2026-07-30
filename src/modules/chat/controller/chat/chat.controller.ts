// src/chat/controllers/chat.controller.ts
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Request,
  HttpStatus,
  UseInterceptors,
  UploadedFiles,
  UseGuards,
  Res,
  StreamableFile,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiBody,
  ApiConsumes
} from '@nestjs/swagger';
// src/chat/controllers/chat.controller.ts
import { CreateConversationDto, CreateGroupDto, SendMessageDto } from '../../dto/create-conversation.dto';
import { ChatService } from '../../services/chat/chat.service';
import { Conversation } from '../../entities/conversation.entity';
import { Message } from '../../entities/messages.entity';
import { FilesInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from 'src/core/decorators/current-user.decorator';
import { User } from 'src/modules/iam/user/entities/user.entity';
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { Response } from 'express';

@ApiTags('chat')
@Controller('chat')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ChatController {
  constructor(private chatService: ChatService) {}

  @Post('conversations')
  @ApiOperation({ summary: 'Créer une nouvelle conversation' })
  @ApiResponse({ 
    status: HttpStatus.CREATED, 
    description: 'Conversation créée avec succès',
    type: Conversation,
  })
  @ApiResponse({ 
    status: HttpStatus.NOT_FOUND, 
    description: 'Utilisateur non trouvé' 
  })
  @ApiBody({ type: CreateConversationDto })
  async createConversation(@Body() dto: CreateConversationDto, @Request() req) {
    return await this.chatService.createConversation(dto, req.user.id);
  }





  @Post('groups')
  @ApiOperation({ summary: 'Créer un nouveau groupe' })
  @ApiResponse({ 
    status: HttpStatus.CREATED, 
    description: 'Groupe créé avec succès',
    type: Conversation,
  })
  @ApiBody({ type: CreateGroupDto })
  async createGroup(@Body() dto: CreateGroupDto, @Request() req) {
    return await this.chatService.createGroup(dto, req.user.id);
  }

  @Get('conversations')
  @ApiOperation({ summary: 'Récupérer les conversations de l\'utilisateur' })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Liste des conversations',
    type: [Conversation],
  })
  async getUserConversations(@Request() req) {
    return await this.chatService.getUserConversations(req.user.id);
  }

  @Get('conversations/:id/messages')
  @ApiOperation({ summary: 'Récupérer les messages d\'une conversation' })
  @ApiParam({ 
    name: 'id', 
    description: 'ID de la conversation',
    type: Number,
  })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Liste des messages',
    type: [Message],
  })
  @ApiResponse({ 
    status: HttpStatus.NOT_FOUND, 
    description: 'Conversation non trouvée' 
  })
  async getConversationMessages(@Param('id') id: string, @Request() req) {
    return await this.chatService.getConversationMessages(parseInt(id), req.user.id);
  }

  @Get('conversations/:id')
  @ApiOperation({ summary: 'Récupérer une conversation' })
  @ApiParam({ 
    name: 'id', 
    description: 'ID de la conversation',
    type: Number,
  })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Liste des messages',
    type: [Message],
  })
  @ApiResponse({ 
    status: HttpStatus.NOT_FOUND, 
    description: 'Conversation non trouvée' 
  })
  async getConversation(@Param('id') id: string, @Request() req) {
    return await this.chatService.getConversation(parseInt(id), req.user.id);
  }

  @Post('messages')
  @ApiOperation({ summary: 'Envoyer un message' })
  @ApiResponse({ 
    status: HttpStatus.CREATED, 
    description: 'Message envoyé avec succès',
    type: Message,
  })
  @ApiBody({ type: SendMessageDto })
  async sendMessage(@Body() dto: SendMessageDto, @Request() req) {
    return await this.chatService.sendMessage(dto, req.user.id);
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
        replyToId: { type: 'number' },
        metadata: { type: 'object' },
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
  @UseInterceptors(FilesInterceptor('attachments', 10, {
    limits: { fileSize: 10 * 1024 * 1024, files: 10 },
  }))
  async sendMessageWithFiles(
    @Body() dto: SendMessageDto,
    @CurrentUser() user: User,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    return this.chatService.sendMessageWithAttachments(
      dto, 
      user.id,
      files || []
    );
  }

  @Post('send-with-attachement-ids')
  @ApiBody({ type: SendMessageDto })
  @ApiResponse({ status: 201, description: 'Message envoyé avec succès' })
  async sendMessageWithAttachementIds(
    @Body() dto: SendMessageDto, 
    @CurrentUser() user: User
  ) {
    return this.chatService.sendMessageWithExistingAttachments(
      dto,
      user.id
    );
  }


  @Post('upload/attachements')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Send message with optional attachments',
    schema: {
      type: 'object',
      properties: {
        conversationId: { type: 'number' },
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
  @UseInterceptors(FilesInterceptor('attachments', 10, {
    limits: { fileSize: 10 * 1024 * 1024, files: 10 },
  }))
  
  async uploadFiles(
    @Request() req,
    @Body('conversationId') conversationId: string,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    return this.chatService.uploadAttachments(
      req.user.id,
      Number(conversationId),
      files || []
    );
  }

  @Get('attachments/:id/content')
  @ApiOperation({ summary: 'Télécharger une pièce jointe autorisée du chat' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Contenu privé de la pièce jointe' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Pièce jointe introuvable ou inaccessible' })
  async downloadAttachment(
    @Param('id', ParseIntPipe) id: number,
    @Request() req,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const attachment = await this.chatService.downloadAttachment(
      id,
      req.user.id,
      {
        ip: req.ip ?? req.socket?.remoteAddress ?? null,
        userAgent: req.headers?.['user-agent'] ?? null,
        requestId:
          req.headers?.['x-request-id'] ??
          req.headers?.['x-correlation-id'] ??
          null,
      },
    );
    response.setHeader('Content-Type', attachment.mimeType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`,
    );
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(attachment.buffer);
  }


  @Post('conversations/:id/read')
  @ApiOperation({ summary: 'Marquer les messages comme lus' })
  @ApiParam({ 
    name: 'id', 
    description: 'ID de la conversation',
    type: Number,
  })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Messages marqués comme lus' 
  })
  async markAsRead(@Param('id') id: string, @Request() req) {
    return await this.chatService.markMessagesAsRead(parseInt(id), req.user.id);
  }
}
