import { Module } from '@nestjs/common';
import { AiDatabaseService } from './ai-database.service';
import { AiDatabaseController } from './ai-database.controller';
import { SchemaMetadataService } from './schema-metadata.service';
import { SqlValidatorService } from './sql-validator.service';

@Module({
  controllers: [AiDatabaseController],
  providers: [AiDatabaseService, SchemaMetadataService,SqlValidatorService],
  exports:[AiDatabaseService]
})
export class AiDatabaseModule {}
