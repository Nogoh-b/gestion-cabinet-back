import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';

import { AgenciesModule } from '../agencies/agencies.module';
import { ChatController } from './controller/chat/chat.controller';
import { Conversation } from './entities/conversation.entity';
import { Message } from './entities/messages.entity';
import { ChatService } from './services/chat/chat.service';
import { MessageRead } from './entities/message-read.entity';
import { Attachment } from './entities/attachment.entity';
import {
  CHAT_TRANSCRIPTION_QUEUE,
  ChatTranscriptionProcessor,
  ChatTranscriptionService,
} from './services/chat/chat-transcription.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Conversation, Message, MessageRead, Attachment]),
    BullModule.registerQueue({ name: CHAT_TRANSCRIPTION_QUEUE }),
    forwardRef(() => AgenciesModule),
  ],
  providers: [ChatService, ChatTranscriptionService, ChatTranscriptionProcessor],
  exports: [ChatService, TypeOrmModule],
  controllers: [ChatController],
})
export class ChatModule {}
