import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AgenciesModule } from '../agencies/agencies.module';
import { NotificationModule } from '../notification/notification.module';
import { ChatController } from './controller/chat/chat.controller';
import { Conversation } from './entities/conversation.entity';
import { Message } from './entities/messages.entity';
import { ChatGateway } from './gateways/chat.gateway';
import { ChatService } from './services/chat/chat.service';

@Module({
  imports: [TypeOrmModule.forFeature([Conversation, Message]), AgenciesModule, NotificationModule],
  providers: [ChatService, ChatGateway, NotificationModule],
  controllers: [ChatController]
})
export class ChatModule {}
