import { forwardRef, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AudienceTypeModule } from '../audience-type/audience-type.module';
import { CustomerModule } from '../customer/customer.module';
import { DocumentsModule } from '../documents/documents.module';
import { DossiersModule } from '../dossiers/dossiers.module';
import { AudiencesController } from './audiences.controller';
import { AudiencesService } from './audiences.service';
import { Audience } from './entities/audience.entity';
import { AudienceStatsService } from './audience-stats.service';
import { JurisdictionModule } from '../jurisdiction/jurisdiction.module';
import { AudienceSubscriber } from './suscribers/audiences.suscribers';
import { AudienceDecisionService } from './audience-decision.service';
import { AudienceWriteHandler } from './audience-write.handler';
import { WriteHandlerRegistry } from 'src/core/ai-database/write/write-handler.registry';
import { AiDatabaseModule } from 'src/core/ai-database/ai-database.module';
import { PlansModule } from '../plans/plans.module';
import { AudienceRecording } from './recordings/audience-recording.entity';
import {
  AudienceRecordingsController,
  RecordingUploadPrecheck,
} from './recordings/audience-recordings.controller';
import { AudienceRecordingsService } from './recordings/audience-recordings.service';
import { AudienceTranscriptService } from './recordings/audience-transcript.service';
import {
  AUDIENCE_RECORDING_TRANSCRIPTION_QUEUE,
  AudienceRecordingTranscriptionProcessor,
  AudienceRecordingTranscriptionService,
} from './recordings/audience-recording-transcription.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Audience, AudienceRecording]),
    BullModule.registerQueue({ name: AUDIENCE_RECORDING_TRANSCRIPTION_QUEUE }),
    CustomerModule,
    AudienceTypeModule,
    JurisdictionModule,
    DocumentsModule,
    forwardRef(() => DossiersModule),
    AiDatabaseModule,
    PlansModule,
  ],
  // Enregistrements d'abord : `GET /audiences/recording-config` avant `GET /audiences/:id`.
  controllers: [AudienceRecordingsController, AudiencesController],
  providers: [
    AudiencesService,
    AudienceSubscriber,
    AudienceStatsService,
    AudienceDecisionService,
    AudienceWriteHandler,
    AudienceRecordingsService,
    AudienceRecordingTranscriptionService,
    AudienceRecordingTranscriptionProcessor,
    RecordingUploadPrecheck,
    AudienceTranscriptService,
  ],
  // Transcription assemblée : faits des compétences IA (cible audience).
  exports: [AudiencesService, AudienceStatsService, AudienceTranscriptService],
})
export class AudiencesModule {
  constructor(
    private readonly registry: WriteHandlerRegistry,
    private readonly handler: AudienceWriteHandler,
  ) {}

  onModuleInit() {
    this.registry.register(this.handler);
  }
}
