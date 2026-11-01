import { forwardRef, Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Facture } from './entities/facture.entity';
import { FactureController } from './facture.controller';
import { FactureService } from './facture.service';
import { DossiersModule } from '../dossiers/dossiers.module';
import { FactureStatsService } from './facture-stats.service';
import {
  EnvoyerFactureAiAction,
  RelancerImpayesAiAction,
} from './facture-ai-actions';
import { AiActionRegistry } from 'src/core/ai-database/write/ai-action.registry';
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
    FactureSubscriber,
    // Actions métier IA : passent par FactureService (cycle de vie respecté).
    EnvoyerFactureAiAction,
    RelancerImpayesAiAction,
  ],
  exports: [FactureService, FactureStatsService, TypeOrmModule],
})
export class FactureModule implements OnModuleInit {
  constructor(
    private readonly aiActions: AiActionRegistry,
    private readonly envoyerFacture: EnvoyerFactureAiAction,
    private readonly relancerImpayes: RelancerImpayesAiAction,
  ) {}

  onModuleInit() {
    this.aiActions.register(this.envoyerFacture);
    this.aiActions.register(this.relancerImpayes);
  }
}
