import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';



import { AudienceTypeModule } from '../audience-type/audience-type.module';
import { CustomerModule } from '../customer/customer.module';
import { DocumentsModule } from '../documents/documents.module';
import { DossiersModule } from '../dossiers/dossiers.module';
import { AudiencesController } from './audiences.controller';
import { AudiencesService } from './audiences.service';
import { Audience } from './entities/audience.entity';
import { AudienceStatsService } from './audience-stats.service';
import { JurisdictionModule } from '../jurisdiction/jurisdiction.module';
import { AudienceSubscriber } from './suscribers/audiences.suscribers';
import { AudienceDecisionService } from './audience-decision.service';
import { AudienceWriteHandler } from './audience-write.handler';
import { WriteHandlerRegistry } from 'src/core/ai-database/write/write-handler.registry';
import { AiDatabaseModule } from 'src/core/ai-database/ai-database.module';
import { PlansModule } from '../plans/plans.module';




@Module({
  imports: [
    TypeOrmModule.forFeature([Audience]),
    CustomerModule,
    AudienceTypeModule,
    JurisdictionModule,
    DocumentsModule,
    forwardRef(() => DossiersModule),
    AiDatabaseModule,
    PlansModule,
  ],
  controllers: [AudiencesController],
  providers: [AudiencesService, AudienceSubscriber, AudienceStatsService, AudienceDecisionService, AudienceWriteHandler],
  exports: [AudiencesService, AudienceStatsService]

})
export class AudiencesModule {
  constructor(
    private readonly registry: WriteHandlerRegistry,
    private readonly handler: AudienceWriteHandler,
  ) {}

  onModuleInit() {
    this.registry.register(this.handler);
  }
}
