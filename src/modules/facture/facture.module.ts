import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Facture } from './entities/facture.entity';
import { FactureController } from './facture.controller';
import { FactureService } from './facture.service';
import { DossiersModule } from '../dossiers/dossiers.module';
import { FactureStatsService } from './facture-stats.service';


@Module({
  imports: [TypeOrmModule.forFeature([Facture]), forwardRef(() => DossiersModule) ],
  controllers: [FactureController],
  providers: [FactureService, FactureStatsService],
  exports: [FactureService, FactureStatsService,TypeOrmModule],
})
export class FactureModule {}
