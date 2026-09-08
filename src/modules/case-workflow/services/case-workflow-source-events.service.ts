import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { TenantContext } from 'src/core/tenant/tenant.context';
import { Dossier } from 'src/modules/dossiers/entities/dossier.entity';
import { Repository } from 'typeorm';
import {
  BillingTrigger,
  DossierLifecyclePhase,
  RecommendationTrigger,
  WorkflowEngine,
} from '../case-workflow.enums';
import { CaseBillingService } from './case-billing.service';
import { RecommendationService } from './recommendation.service';

interface SourceEvent {
  tenantId: number;
  dossierId: number;
  audienceId?: number;
  documentId?: number;
}

@Injectable()
export class CaseWorkflowSourceEventsService {
  private readonly logger = new Logger(CaseWorkflowSourceEventsService.name);

  constructor(
    private readonly tenantContext: TenantContext,
    @InjectRepository(Dossier)
    private readonly dossierRepository: Repository<Dossier>,
    private readonly recommendationService: RecommendationService,
    private readonly billingService: CaseBillingService,
  ) {}

  @OnEvent('case-workflow.source.document-changed', { async: true })
  async onDocumentChanged(event: SourceEvent): Promise<void> {
    await this.handle(event, async () => {
      await this.recommendationService.evaluate(
        event.dossierId,
        RecommendationTrigger.MANUAL,
        `DOCUMENT_CHANGED:${event.documentId ?? 'unknown'}`,
      );
    });
  }

  @OnEvent('case-workflow.source.audience-created', { async: true })
  async onAudienceCreated(event: SourceEvent): Promise<void> {
    await this.handle(event, async () => {
      if (event.audienceId) {
        await this.billingService.syncAudienceEvent(
          event.audienceId,
          BillingTrigger.AUDIENCE_CREATED,
        );
      }
      await this.recommendationService.evaluate(
        event.dossierId,
        RecommendationTrigger.AUDIENCE_DUE,
        `AUDIENCE_CREATED:${event.audienceId ?? 'unknown'}`,
      );
    });
  }

  @OnEvent('case-workflow.source.audience-held', { async: true })
  async onAudienceHeld(event: SourceEvent): Promise<void> {
    await this.handle(event, async () => {
      if (event.audienceId) {
        await this.billingService.syncAudienceEvent(
          event.audienceId,
          BillingTrigger.AUDIENCE_HELD,
        );
      }
      await this.recommendationService.evaluate(
        event.dossierId,
        RecommendationTrigger.MANUAL,
        `AUDIENCE_HELD:${event.audienceId ?? 'unknown'}`,
      );
    });
  }

  @OnEvent('case-workflow.source.audience-postponed', { async: true })
  async onAudiencePostponed(event: SourceEvent): Promise<void> {
    await this.handle(event, () =>
      this.recommendationService
        .evaluate(
          event.dossierId,
          RecommendationTrigger.AUDIENCE_POSTPONED,
          `AUDIENCE_POSTPONED:${event.audienceId ?? 'unknown'}`,
        )
        .then(() => undefined),
    );
  }

  private async handle(
    event: SourceEvent,
    task: () => Promise<void>,
  ): Promise<void> {
    if (!Number.isInteger(event.tenantId) || !Number.isInteger(event.dossierId))
      return;
    try {
      await this.tenantContext.run(event.tenantId, async () => {
        const dossier = await this.dossierRepository.findOne({
          where: { id: event.dossierId, tenant_id: event.tenantId },
        });
        if (
          !dossier ||
          dossier.workflow_engine !== WorkflowEngine.ACTIONS_V2 ||
          dossier.lifecycle_phase !== DossierLifecyclePhase.TREATMENT
        )
          return;
        await task();
      });
    } catch (error) {
      this.logger.error(
        `Synchronisation source dossier=${event.dossierId} tenant=${event.tenantId}: ${(error as Error).message}`,
      );
    }
  }
}
