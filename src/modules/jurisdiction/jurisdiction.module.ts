import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Jurisdiction } from './entities/jurisdiction.entity';
import { JurisdictionController } from './jurisdiction.controller';
import { JurisdictionService } from './jurisdiction.service';


@Module({
    imports : [
          TypeOrmModule.forFeature([Jurisdiction]),
      
    ],
    exports :[JurisdictionService],
  controllers: [JurisdictionController],
  providers: [JurisdictionService],
})
export class JurisdictionModule {}
