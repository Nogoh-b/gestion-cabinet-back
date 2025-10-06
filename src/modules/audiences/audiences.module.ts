import { Module } from '@nestjs/common';
import { AudiencesService } from './audiences.service';
import { AudiencesController } from './audiences.controller';

@Module({
  controllers: [AudiencesController],
  providers: [AudiencesService],
})
export class AudiencesModule {}
