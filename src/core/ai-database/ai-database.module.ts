import { Module } from '@nestjs/common';
import { AiDatabaseService } from './ai-database.service';
import { AiDatabaseController } from './ai-database.controller';

@Module({
  controllers: [AiDatabaseController],
  providers: [AiDatabaseService],
  exports:[AiDatabaseService]
})
export class AiDatabaseModule {}
