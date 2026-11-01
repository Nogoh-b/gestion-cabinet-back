import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AgenciesModule } from '../agencies/agencies.module';
import { ChatController } from './controller/chat/chat.controller';
import { Conversation } from './entities/conversation.entity';
import { Message } from './entities/messages.entity';
import { ChatService } from './services/chat/chat.service';
import { MessageRead } from './entities/message-read.entity';
import { Attachment } from './entities/attachment.entity';
import { ChatAttachmentStorageService } from './services/chat/chat-attachment-storage.service';
import { AntivirusScannerService } from '../documents/document-customer/antivirus-scanner.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Conversation, Message, MessageRead, Attachment]), 
    forwardRef(() => AgenciesModule),
],
  providers: [ChatService, ChatAttachmentStorageService, AntivirusScannerService],
  exports: [ChatService, TypeOrmModule],
  controllers: [ChatController]
})
export class ChatModule {}
