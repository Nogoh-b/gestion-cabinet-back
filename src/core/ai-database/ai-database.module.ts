import { Module } from '@nestjs/common';
import { AiDatabaseService } from './ai-database.service';
import { AiDatabaseController } from './ai-database.controller';
import { SchemaMetadataService } from './schema-metadata.service';
import { SqlValidatorService } from './sql-validator.service';
import { ConversationManagerService } from './conversation-manager.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Conversation } from './entities/conversation.entity';
import { ConversationMessage } from './entities/conversation-message.entity';
import { DocumentCustomer } from '../../modules/documents/document-customer/entities/document-customer.entity';
import { GenericWriteService } from './generic-write.service';
import { IntentDetectionService } from './intent-detection.service';
import { WriteHandlerRegistry } from './write/write-handler.registry';
import { EntityResolverService } from './write/entity-resolver.service';
import { AutoHandlerFactory } from './write/auto-handler-factory.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Conversation,
      ConversationMessage,
      DocumentCustomer,
    ]),
  ],
  controllers: [AiDatabaseController],
  providers: [
    AiDatabaseService,
    SchemaMetadataService,
    SqlValidatorService,
    ConversationManagerService,
    GenericWriteService,
    WriteHandlerRegistry,
    IntentDetectionService,
    EntityResolverService,
    AutoHandlerFactory,
  ],
  exports: [
    AiDatabaseService,
    WriteHandlerRegistry,
    GenericWriteService,
    EntityResolverService,
    SchemaMetadataService
  ],
})
export class AiDatabaseModule {}
