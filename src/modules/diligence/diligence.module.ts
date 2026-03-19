import { forwardRef, Module } from '@nestjs/common';
import { DiligencesController } from './diligence.controller';
import { DiligencesService } from './diligence.service';
import { DossiersModule } from '../dossiers/dossiers.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Diligence } from './entities/diligence.entity';
import { DocumentsModule } from '../documents/documents.module';
import { FindingModule } from '../finding/finding.module';
import { DiligenceStatsService } from './diligence-stats.service';

@Module({
  controllers: [DiligencesController],
  providers: [DiligencesService, DiligenceStatsService],
  exports: [DiligencesService, DiligenceStatsService],
  imports: [forwardRef(() => FindingModule) , DossiersModule, DocumentsModule, TypeOrmModule.forFeature([Diligence]),
  ],
})
export class DiligenceModule {}
