import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Jurisdiction } from './entities/jurisdiction.entity';
import { JurisdictionController } from './jurisdiction.controller';
import { JurisdictionService } from './jurisdiction.service';
import { JurisdictionStatsService } from './jurisdiction-stats.service';


@Module({
    imports : [
          TypeOrmModule.forFeature([Jurisdiction]),
      
    ],
  exports :[JurisdictionService, JurisdictionStatsService],
  controllers: [JurisdictionController],
  providers: [JurisdictionService, JurisdictionStatsService],
})
export class JurisdictionModule {}
