import { forwardRef, Module } from '@nestjs/common';
import { DiligencesController } from './diligence.controller';
import { DiligencesService } from './diligence.service';
import { DossiersModule } from '../dossiers/dossiers.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Diligence } from './entities/diligence.entity';
import { DocumentsModule } from '../documents/documents.module';
import { FindingModule } from '../finding/finding.module';
import { DiligenceStatsService } from './diligence-stats.service';
import { DiligenceWriteHandler } from './diligence-write.handler';
import { WriteHandlerRegistry } from 'src/core/ai-database/write/write-handler.registry';
import { AiDatabaseModule } from 'src/core/ai-database/ai-database.module';

@Module({
  controllers: [DiligencesController],
  providers: [DiligencesService, DiligenceStatsService, DiligenceWriteHandler],
  exports: [DiligencesService, DiligenceStatsService],
  imports: [
    forwardRef(() => FindingModule),
    forwardRef(() => DossiersModule),
    DocumentsModule,
    TypeOrmModule.forFeature([Diligence]),
    AiDatabaseModule,
  ],
})
export class DiligenceModule {
  constructor(
    private readonly registry: WriteHandlerRegistry,
    private readonly handler: DiligenceWriteHandler,
  ) {}

  onModuleInit() {
    this.registry.register(this.handler);
  }
}
