import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Facture } from './entities/facture.entity';
import { FactureController } from './facture.controller';
import { FactureService } from './facture.service';
import { DossiersModule } from '../dossiers/dossiers.module';
import { FactureStatsService } from './facture-stats.service';
import { FactureWriteHandler } from './facture-write.handler';
import { WriteHandlerRegistry } from 'src/core/ai-database/write/write-handler.registry';
import { AiDatabaseModule } from 'src/core/ai-database/ai-database.module';
import { Cabinet } from '../cabinet/entities/cabinet.entity';
import { FactureSubscriber } from './subscribers/facture.subscriber';
import { InvoiceType } from '../invoice-type/entities/invoice-type.entity';
import { CaseWorkflowModule } from '../case-workflow/case-workflow.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Facture, Cabinet, InvoiceType]),
    forwardRef(() => DossiersModule),
    forwardRef(() => CaseWorkflowModule),
    AiDatabaseModule,
  ],
  controllers: [FactureController],
  providers: [
    FactureService,
    FactureStatsService,
    FactureWriteHandler,
    FactureSubscriber,
  ],
  exports: [FactureService, FactureStatsService, TypeOrmModule],
})
export class FactureModule {
  constructor(
    private readonly registry: WriteHandlerRegistry,
    private readonly factureWriteHandler: FactureWriteHandler,
  ) {}

  onModuleInit() {
    this.registry.register(this.factureWriteHandler);
  }
}
