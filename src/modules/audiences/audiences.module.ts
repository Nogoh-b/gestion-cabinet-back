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
import { PlansModule } from '../plans/plans.module';
import { ProcedureModule } from '../procedure/procedure.module';
import { LegalDeadlineRule } from './entities/legal-deadline-rule.entity';
import { LegalDeadline } from './entities/legal-deadline.entity';
import {
  LegalDeadlineController,
  LegalDeadlineRuleController,
} from './legal-deadline.controller';
import { LegalDeadlineRuleService } from './legal-deadline-rule.service';
import { LegalDeadlineService } from './legal-deadline.service';
import { LegalDeadlineExpiryListener } from './legal-deadline-expiry.listener';
import { LegalDeadlineWarningListener } from './legal-deadline-warning.listener';




@Module({
  imports: [
    TypeOrmModule.forFeature([Audience, LegalDeadlineRule, LegalDeadline]),
    CustomerModule,
    AudienceTypeModule,
    JurisdictionModule,
    DocumentsModule,
    forwardRef(() => DossiersModule),
    forwardRef(() => ProcedureModule),
    PlansModule,
  ],
  controllers: [
    AudiencesController,
    LegalDeadlineRuleController,
    LegalDeadlineController,
  ],
  providers: [
    AudiencesService,
    AudienceSubscriber,
    AudienceStatsService,
    AudienceDecisionService,
    LegalDeadlineRuleService,
    LegalDeadlineService,
    LegalDeadlineExpiryListener,
    LegalDeadlineWarningListener,
  ],
  exports: [
    AudiencesService,
    AudienceStatsService,
    LegalDeadlineRuleService,
    LegalDeadlineService,
  ]

})
export class AudiencesModule {}
