import { forwardRef, Module, OnModuleInit } from '@nestjs/common';
import { ProceduresService } from './procedures.service';
import { ProceduresController } from './procedures.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomerModule } from '../customer/customer.module';
import { ProcedureType } from './entities/procedure.entity';
import { ProcedureTemplate } from '../procedure/entities/procedure-template.entity';
import { ProcedureTypeSubscriber } from './subscribers/procedure-type.subscriber';
import { Dossier } from '../dossiers/entities/dossier.entity';
import { DossiersModule } from '../dossiers/dossiers.module';
import { ProcedureStatsService } from './procedure-stats.service';
import { ProcedureModule } from '../procedure/procedure.module';
import { ProcedureTypeWriteHandler } from './procedure-type-write.handler';
import { WriteHandlerRegistry } from 'src/core/ai-database/write/write-handler.registry';
import { AiDatabaseModule } from 'src/core/ai-database/ai-database.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ProcedureType, ProcedureTemplate, Dossier]),
    CustomerModule,
    ProcedureModule,
    forwardRef(() => DossiersModule),
    AiDatabaseModule,
  ],
  controllers: [ProceduresController],
  providers: [
    ProceduresService,
    ProcedureStatsService,
    ProcedureTypeSubscriber,
    ProcedureTypeWriteHandler,
  ],
  exports: [ProceduresService, ProcedureStatsService],
})
export class ProceduresModule implements OnModuleInit {
  constructor(
    private readonly registry: WriteHandlerRegistry,
    private readonly handler0: ProcedureTypeWriteHandler,
  ) {}

  onModuleInit() {
    this.registry.register(this.handler0);
  }
}
