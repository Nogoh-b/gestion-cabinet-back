import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CustomerModule } from '../customer/customer.module';
import { DocumentsModule } from '../documents/documents.module';
import { User } from '../iam/user/entities/user.entity';
import { ProcedureType } from '../procedures/entities/procedure.entity';
import { DossiersController } from './dossiers.controller';
import { DossiersService } from './dossiers.service';
import { Dossier } from './entities/dossier.entity';
import { ChatModule } from '../chat/chat.module';
import { DossierStatsService } from './dossier-stats.service';
import { DossierAccessGrantsService } from './dossier-access-grants.service';
import { DossierAccessGrant } from './entities/dossier-access-grant.entity';
import { DossierVisibilityPatch } from './dossier-visibility.patch';
import { AudiencesModule } from '../audiences/audiences.module';
import { DiligenceModule } from '../diligence/diligence.module';
import { FactureModule } from '../facture/facture.module';
import { ProcedureModule } from '../procedure/procedure.module';
import { DossierSubscriber } from './subscribers/dossier.subscriber';
import { DossierChatSyncService } from './dossier-chat-sync.service';
import { Conversation } from '../chat/entities/conversation.entity';
import { Employee } from '../agencies/employee/entities/employee.entity';
import { PlansModule } from '../plans/plans.module';
import { Cabinet } from '../cabinet/entities/cabinet.entity';
import { DossierMember } from './entities/dossier-member.entity';
import { CaseWorkflowModule } from '../case-workflow/case-workflow.module';
import { CaseWorkflowFeature } from '../case-workflow/entities/workflow-audit.entity';
import { DossierBillingProfile } from '../case-workflow/entities/billing.entity';

@Module({
  imports: [
    forwardRef(() => CustomerModule),
    forwardRef(() => DocumentsModule),
    forwardRef(() => ChatModule),
    forwardRef(() => AudiencesModule),
    forwardRef(() => DiligenceModule),
    forwardRef(() => FactureModule),
    forwardRef(() => ProcedureModule),

    TypeOrmModule.forFeature([
      Dossier,
      DossierMember,
      DossierAccessGrant,
      User,
      ProcedureType,
      Conversation,
      Employee,
      Cabinet,
      CaseWorkflowFeature,
      DossierBillingProfile,
    ]),
    PlansModule,
    forwardRef(() => CaseWorkflowModule),
  ],
  controllers: [DossiersController],
  providers: [
    DossiersService,
    DossierStatsService,
    DossierAccessGrantsService,
    DossierVisibilityPatch,
    DossierChatSyncService,
    DossierSubscriber,
  ],
  exports: [
    DossiersService,
    DossierChatSyncService,
    DossierStatsService,
    DossierAccessGrantsService,
    TypeOrmModule,
  ],
})
export class DossiersModule {}
