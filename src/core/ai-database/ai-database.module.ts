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
import { AiActionRegistry } from './write/ai-action.registry';
import { AiSkillRegistry } from './skills/ai-skill.registry';
import { AiSkillService } from './skills/ai-skill.service';
import { UserProfileService } from './user-profile.service';
import { EntityResolverService } from './write/entity-resolver.service';
import { AutoHandlerFactory } from './write/auto-handler-factory.service';
import { AiDatabasePermissionService } from './ai-database-permission.service';
import { IamModule } from 'src/modules/iam/iam.module';
import { PlansModule } from 'src/modules/plans/plans.module';
import { AiRequestLog } from './entities/ai-request-log.entity';
import { AiConversationDocument } from './entities/ai-conversation-document.entity';
import { AiQuotaGuard } from './guards/ai-quota.guard';
import { AiModelRouterService } from './ai-model-router.service';
import { AiUsageService } from './ai-usage.service';
import { ImageReaderService } from './image-reader.service';
import { PlanFieldsService } from './plan-fields.service';
import { AiAdminController } from './ai-admin.controller';
import { CabinetAiSettingsService } from './cabinet-ai-settings.service';
import { SettingsModule } from 'src/modules/settings/settings.module';
import { AiContextConfig, AiContextSuggestion } from './entities/ai-context-config.entity';
import { AiContextConfigService } from './ai-context-config.service';
import { AiContextConfigController } from './ai-context-config.controller';
import { AudioTranscriptionService } from './audio-transcription.service';

@Module({
  imports: [
    IamModule,
    PlansModule,
    SettingsModule,
    TypeOrmModule.forFeature([
      Conversation,
      ConversationMessage,
      DocumentCustomer,
      AiRequestLog,
      AiConversationDocument,
      AiContextConfig,
      AiContextSuggestion,
    ]),
  ],
  controllers: [AiDatabaseController, AiAdminController, AiContextConfigController],
  providers: [
    AiDatabaseService,
    AudioTranscriptionService,
    SchemaMetadataService,
    SqlValidatorService,
    ConversationManagerService,
    GenericWriteService,
    WriteHandlerRegistry,
    AiActionRegistry,
    AiSkillRegistry,
    AiSkillService,
    UserProfileService,
    IntentDetectionService,
    EntityResolverService,
    AutoHandlerFactory,
    AiDatabasePermissionService,
    AiModelRouterService,
    CabinetAiSettingsService,
    AiUsageService,
    ImageReaderService,
    PlanFieldsService,
    AiQuotaGuard,
    AiContextConfigService,
  ],
  exports: [
    AiDatabaseService,
    AiModelRouterService,
    AiUsageService,
    WriteHandlerRegistry,
    AiActionRegistry,
    AiSkillRegistry,
    UserProfileService,
    GenericWriteService,
    EntityResolverService,
    SchemaMetadataService,
    AiDatabasePermissionService,
    ImageReaderService,
  ],
})
export class AiDatabaseModule {}
