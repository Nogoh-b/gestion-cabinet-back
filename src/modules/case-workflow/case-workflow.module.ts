import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Audience } from 'src/modules/audiences/entities/audience.entity';
import { Cabinet } from 'src/modules/cabinet/entities/cabinet.entity';
import { Dossier } from 'src/modules/dossiers/entities/dossier.entity';
import { DocumentCustomer } from 'src/modules/documents/document-customer/entities/document-customer.entity';
import { FactureModule } from 'src/modules/facture/facture.module';
import { Facture } from 'src/modules/facture/entities/facture.entity';
import { User } from 'src/modules/iam/user/entities/user.entity';
import {
  ActionCatalogController,
  BillingRulesController,
  BillableItemsController,
  CaseInvoicesController,
  CaseWorkflowSettingsController,
  DossierActionsController,
  DossierWorkspaceController,
  RecommendationsController,
  WorkflowMappingsController,
} from './case-workflow.controller';
import {
  ActionDefinition,
  ActionFamily,
} from './entities/action-catalog.entity';
import {
  BillableItem,
  DossierBillingProfile,
  DossierBillingRule,
  InvoiceLine,
} from './entities/billing.entity';
import {
  DossierAction,
  DossierActionAudienceLink,
  DossierActionDocumentLink,
  DossierActionRelation,
} from './entities/dossier-action.entity';
import {
  DossierRecommendation,
  RecommendationRule,
} from './entities/recommendation.entity';
import {
  CaseWorkflowEvent,
  CaseWorkflowFeature,
  CaseWorkflowMigrationRun,
  CaseWorkflowOutbox,
  DossierClosureReview,
  LegacyWorkflowMapping,
} from './entities/workflow-audit.entity';
import { ActionCatalogService } from './services/action-catalog.service';
import { CaseBillingService } from './services/case-billing.service';
import { CaseWorkflowService } from './services/case-workflow.service';
import { DossierActionService } from './services/dossier-action.service';
import { RecommendationService } from './services/recommendation.service';
import { WorkflowEventService } from './services/workflow-event.service';
import { CaseWorkflowScheduler } from './services/case-workflow.scheduler';
import { NotificationModule } from 'src/modules/notification/notification.module';
import { Diligence } from 'src/modules/diligence/entities/diligence.entity';
import { CaseWorkflowSourceEventsService } from './services/case-workflow-source-events.service';

const ENTITIES = [
  Dossier,
  User,
  Audience,
  DocumentCustomer,
  Diligence,
  Cabinet,
  Facture,
  ActionFamily,
  ActionDefinition,
  DossierAction,
  DossierActionDocumentLink,
  DossierActionAudienceLink,
  DossierActionRelation,
  RecommendationRule,
  DossierRecommendation,
  DossierBillingProfile,
  DossierBillingRule,
  BillableItem,
  InvoiceLine,
  CaseWorkflowFeature,
  CaseWorkflowEvent,
  CaseWorkflowOutbox,
  DossierClosureReview,
  CaseWorkflowMigrationRun,
  LegacyWorkflowMapping,
];

@Module({
  imports: [
    TypeOrmModule.forFeature(ENTITIES),
    forwardRef(() => FactureModule),
    forwardRef(() => NotificationModule),
  ],
  controllers: [
    ActionCatalogController,
    BillingRulesController,
    BillableItemsController,
    DossierWorkspaceController,
    DossierActionsController,
    RecommendationsController,
    CaseInvoicesController,
    CaseWorkflowSettingsController,
    WorkflowMappingsController,
  ],
  providers: [
    WorkflowEventService,
    ActionCatalogService,
    RecommendationService,
    CaseBillingService,
    DossierActionService,
    CaseWorkflowService,
    CaseWorkflowScheduler,
    CaseWorkflowSourceEventsService,
  ],
  exports: [CaseWorkflowService, CaseBillingService, DossierActionService],
})
export class CaseWorkflowModule {}
