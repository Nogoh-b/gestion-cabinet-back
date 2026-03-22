import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AgenciesModule } from '../agencies/agencies.module';
import { ChatController } from './controller/chat/chat.controller';
import { Conversation } from './entities/conversation.entity';
import { Message } from './entities/messages.entity';
import { ChatService } from './services/chat/chat.service';
import { MessageRead } from './entities/message-read.entity';
import { Attachment } from './entities/attachment.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Conversation, Message, MessageRead, Attachment]), 
    forwardRef(() => AgenciesModule),
],
  providers: [ChatService],
  exports: [ChatService],
  controllers: [ChatController]
})
export class ChatModule {}
