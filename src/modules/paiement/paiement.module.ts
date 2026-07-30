import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { FactureModule } from '../facture/facture.module';
import { Paiement } from './entities/paiement.entity';
import { Facture } from '../facture/entities/facture.entity';
import { PaiementController } from './paiement.controller';
import { PaiementService } from './paiement.service';
import { PaiementSubscriber } from './subscribers/paiement.subscriber';
import { Cabinet } from '../cabinet/entities/cabinet.entity';
import { DocumentsModule } from '../documents/documents.module';


@Module({
  imports: [
    TypeOrmModule.forFeature([Paiement, Facture, Cabinet]),
    FactureModule,
    DocumentsModule,
  ],
  controllers: [PaiementController],
  providers: [PaiementService, PaiementSubscriber],
  exports: [PaiementService, TypeOrmModule],
})
export class PaiementModule {}
