import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AudienceTypeController } from './audience-type.controller';
import { AudienceTypeService } from './audience-type.service';
import { AudienceType } from './entities/audience-type.entity';


@Module({
  imports : [
        TypeOrmModule.forFeature([AudienceType]),
    
  ],
  exports :[AudienceTypeService],
  controllers: [AudienceTypeController],
  providers: [AudienceTypeService],
})
export class AudienceTypeModule {}
