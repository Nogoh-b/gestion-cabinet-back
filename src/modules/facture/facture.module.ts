import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Facture } from './entities/facture.entity';
import { FactureController } from './facture.controller';
import { FactureService } from './facture.service';
import { DossiersModule } from '../dossiers/dossiers.module';


@Module({
  imports: [TypeOrmModule.forFeature([Facture]), DossiersModule ],
  controllers: [FactureController],
  providers: [FactureService],
  exports: [FactureService,TypeOrmModule],
})
export class FactureModule {}
