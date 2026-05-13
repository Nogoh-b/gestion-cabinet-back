import { Module } from '@nestjs/common';
import { AiDatabaseService } from './ai-database.service';
import { AiDatabaseController } from './ai-database.controller';
import { SchemaMetadataService } from './schema-metadata.service';
import { SqlValidatorService } from './sql-validator.service';
import { ConversationManagerService } from './conversation-manager.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Conversation } from './entities/conversation.entity';
import { ConversationMessage } from './entities/conversation-message.entity';
import { GenericWriteService } from './generic-write.service';
import { IntentDetectionService } from './intent-detection.service';
import { WriteHandlerRegistry } from './write/write-handler.registry';
import { EntityResolverService } from './write/entity-resolver.service';
import { AutoHandlerFactory } from './write/auto-handler-factory.service';
import { Customer } from 'src/modules/customer/customer/entities/customer.entity';
import { Employee } from 'src/modules/agencies/employee/entities/employee.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Conversation,
      ConversationMessage,
      Customer,
      Employee,
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
