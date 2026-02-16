import { forwardRef, Module } from '@nestjs/common';
import { FindingsController } from './finding.controller';
import { FindingsService } from './finding.service';
import { DiligenceModule } from '../diligence/diligence.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Finding } from './entities/finding.entity';
import { DocumentsModule } from '../documents/documents.module';

@Module({
  controllers: [FindingsController],
  providers: [FindingsService],
  exports: [FindingsService], 
  imports: [forwardRef(() => DiligenceModule),  DocumentsModule, TypeOrmModule.forFeature([Finding])],
})
export class FindingModule {}
