import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { FactureModule } from '../facture/facture.module';
import { Paiement } from './entities/paiement.entity';
import { Facture } from '../facture/entities/facture.entity';
import { PaiementController } from './paiement.controller';
import { PaiementService } from './paiement.service';
import { PaiementWriteHandler } from './paiement-write.handler';
import { WriteHandlerRegistry } from 'src/core/ai-database/write/write-handler.registry';
import { AiDatabaseModule } from 'src/core/ai-database/ai-database.module';
import { PaiementSubscriber } from './subscribers/paiement.subscriber';


@Module({
  imports: [
    TypeOrmModule.forFeature([Paiement, Facture]),
    FactureModule,
    AiDatabaseModule,
  ],
  controllers: [PaiementController],
  providers: [PaiementService, PaiementWriteHandler, PaiementSubscriber],
  exports: [PaiementService, TypeOrmModule],
})
export class PaiementModule {
  constructor(
    private readonly registry: WriteHandlerRegistry,
    private readonly paiementWriteHandler: PaiementWriteHandler,
  ) {}

  onModuleInit() {
    this.registry.register(this.paiementWriteHandler);
  }
}
