import { Module } from '@nestjs/common';
import { AiDatabaseService } from './ai-database.service';
import { AiDatabaseController } from './ai-database.controller';
import { SchemaMetadataService } from './schema-metadata.service';
import { SqlValidatorService } from './sql-validator.service';
import { ConversationManagerService } from './conversation-manager.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Conversation } from './entities/conversation.entity';
import { ConversationMessage } from './entities/conversation-message.entity';

@Module({

  imports: [
    TypeOrmModule.forFeature([
      Conversation,
      ConversationMessage,
    ]),
  ],
  controllers: [AiDatabaseController],
  providers: [AiDatabaseService, SchemaMetadataService,SqlValidatorService,ConversationManagerService],
  exports:[AiDatabaseService]
})
export class AiDatabaseModule {}
