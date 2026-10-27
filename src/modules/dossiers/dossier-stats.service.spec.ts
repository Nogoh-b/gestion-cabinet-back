import { describe, expect, it, jest } from '@jest/globals';
import { Repository } from 'typeorm';
import { DossierStatus } from 'src/core/enums/dossier-status.enum';
import {
  DossierLifecyclePhase,
  WorkflowEngine,
} from 'src/modules/case-workflow/case-workflow.enums';

import { DossierStatsService } from './dossier-stats.service';
import { Dossier } from './entities/dossier.entity';

interface DossierStatsServiceInternals {
  getActiveCount(): Promise<number>;
  getClosedCount(): Promise<number>;
  getArchivedCount(): Promise<number>;
}

describe('DossierStatsService status filters', () => {
  const createService = () => {
    const queryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getCount: jest.fn<() => Promise<number>>().mockResolvedValue(0),
    };
    const repository = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    };

    return {
      service: new DossierStatsService(
        repository as unknown as Repository<Dossier>,
      ) as unknown as DossierStatsServiceInternals,
      queryBuilder,
    };
  };

  it('compares every in-progress status using MariaDB ENUM values', async () => {
    const { service, queryBuilder } = createService();

    await service.getActiveCount();

    expect(queryBuilder.where).toHaveBeenCalledWith(
      '(dossier.workflow_engine = :v2Engine OR dossier.status IN (:...statuses))',
      {
        v2Engine: WorkflowEngine.ACTIONS_V2,
        statuses: [
          DossierStatus.OPEN,
          DossierStatus.PRELIMINARY_ANALYSIS,
          DossierStatus.AMICABLE,
          DossierStatus.LITIGATION,
          DossierStatus.JUDGMENT,
          DossierStatus.APPEAL,
          DossierStatus.CASSATION,
          DossierStatus.EXECUTION,
        ].map(String),
      },
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'dossier.lifecycle_phase != :closedPhase',
      { closedPhase: DossierLifecyclePhase.CLOSED },
    );
  });

  it('compares the closed status as text', async () => {
    const { service, queryBuilder } = createService();

    await service.getClosedCount();

    expect(queryBuilder.where).toHaveBeenCalledWith(
      '(dossier.lifecycle_phase = :closedPhase OR (dossier.workflow_engine = :legacyEngine AND dossier.status = :closedStatus))',
      {
        closedPhase: DossierLifecyclePhase.CLOSED,
        legacyEngine: WorkflowEngine.LEGACY,
        closedStatus: String(DossierStatus.CLOSED),
      },
    );
  });

  it('compares the archived status as text', async () => {
    const { service, queryBuilder } = createService();

    await service.getArchivedCount();

    expect(queryBuilder.where).toHaveBeenCalledWith(
      'dossier.status = :status',
      { status: String(DossierStatus.ARCHIVED) },
    );
  });
});
