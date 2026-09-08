import { describe, expect, it, jest } from '@jest/globals';
import {
  BillingTrigger,
  DossierLifecyclePhase,
  RecommendationTrigger,
  WorkflowEngine,
} from './case-workflow.enums';
import { CaseWorkflowSourceEventsService } from './services/case-workflow-source-events.service';

describe('case-workflow source events', () => {
  function setup(workflowEngine = WorkflowEngine.ACTIONS_V2) {
    const tenantContext = {
      run: (_tenantId: number, task: () => unknown) => task(),
    };
    const dossierRepository = {
      findOne: jest.fn<() => Promise<any>>().mockResolvedValue({
        id: 59,
        tenant_id: 7,
        workflow_engine: workflowEngine,
        lifecycle_phase: DossierLifecyclePhase.TREATMENT,
      }),
    };
    const recommendationService = {
      evaluate: jest.fn<() => Promise<null>>().mockResolvedValue(null),
    };
    const billingService = {
      syncAudienceEvent: jest
        .fn<() => Promise<void>>()
        .mockResolvedValue(undefined),
    };
    const service = new CaseWorkflowSourceEventsService(
      tenantContext as never,
      dossierRepository as never,
      recommendationService as never,
      billingService as never,
    );
    return { service, recommendationService, billingService };
  }

  it('facture et rÃ©Ã©value immÃ©diatement une audience crÃ©Ã©e', async () => {
    const { service, recommendationService, billingService } = setup();
    await service.onAudienceCreated({
      tenantId: 7,
      dossierId: 59,
      audienceId: 13,
    });
    expect(billingService.syncAudienceEvent).toHaveBeenCalledWith(
      13,
      BillingTrigger.AUDIENCE_CREATED,
    );
    expect(recommendationService.evaluate).toHaveBeenCalledWith(
      59,
      RecommendationTrigger.AUDIENCE_DUE,
      'AUDIENCE_CREATED:13',
    );
  });

  it('ignore les sources dâ€™un dossier encore sur le moteur historique', async () => {
    const { service, recommendationService, billingService } = setup(
      WorkflowEngine.LEGACY,
    );
    await service.onAudienceHeld({
      tenantId: 7,
      dossierId: 59,
      audienceId: 13,
    });
    expect(billingService.syncAudienceEvent).not.toHaveBeenCalled();
    expect(recommendationService.evaluate).not.toHaveBeenCalled();
  });
});
