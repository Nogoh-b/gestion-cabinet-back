import { EntityManager } from 'typeorm';
import { ProcedureRequirementService } from './procedure-requirement.service';
import {
  ProcedureRequirementType,
} from '../interfaces/procedure-requirement.interface';
import { Stage } from '../entities/stage.entity';
import { StageVisit } from '../entities/stage-visit.entity';
import { SubStageVisit } from '../entities/sub-stage-visit.entity';

describe('ProcedureRequirementService', () => {
  let service: ProcedureRequirementService;

  beforeEach(() => {
    service = new ProcedureRequirementService();
  });

  it('échoue de manière restrictive si la matérialisation SQL échoue', async () => {
    const manager = {
      query: jest.fn().mockRejectedValue(new Error('table unavailable')),
    } as unknown as EntityManager;
    const results = await service.evaluate(
      manager,
      'instance-1',
      { id: 'visit-1', metadata: {} } as SubStageVisit,
      [
        {
          id: 'document-required',
          type: ProcedureRequirementType.DOCUMENT_ACCEPTED,
        },
      ],
    );

    expect(results).toEqual([
      expect.objectContaining({
        id: 'document-required',
        satisfied: false,
        details: expect.objectContaining({
          reason: 'REQUIREMENT_EVALUATION_ERROR',
        }),
      }),
    ]);
  });

  it('revérifie la pièce acceptée au lieu de faire confiance à la complétion', async () => {
    const manager = {
      query: jest.fn().mockResolvedValue([{ count: 0 }]),
    } as unknown as EntityManager;
    const subStageVisit = {
      id: 'visit-1',
      subStageId: 'sub-stage-1',
      isCompleted: true,
      startedAt: new Date(),
      metadata: {},
    } as SubStageVisit;
    const stage = {
      id: 'stage-1',
      subStages: [
        {
          id: 'sub-stage-1',
          name: 'Déposer la pièce',
          isMandatory: true,
          requirements: [
            {
              id: 'document-required',
              type: ProcedureRequirementType.DOCUMENT_ACCEPTED,
            },
          ],
        },
      ],
    } as unknown as Stage;
    const stageVisit = {
      id: 'stage-visit-1',
      subStageVisits: [subStageVisit],
    } as StageVisit;

    const blocking = await service.getStageBlockingRequirements(
      manager,
      'instance-1',
      stage,
      stageVisit,
    );

    expect(blocking).toEqual([
      expect.objectContaining({
        id: 'document-required',
        subStageId: 'sub-stage-1',
        satisfied: false,
      }),
    ]);
  });

  it('bloque une sous-étape obligatoire qui ne possède aucune visite terminée', async () => {
    const manager = { query: jest.fn() } as unknown as EntityManager;
    const stage = {
      id: 'stage-1',
      subStages: [
        {
          id: 'sub-stage-1',
          name: 'Contrôle de recevabilité',
          isMandatory: true,
          requirements: [],
        },
      ],
    } as unknown as Stage;

    const blocking = await service.getStageBlockingRequirements(
      manager,
      'instance-1',
      stage,
      { id: 'stage-visit-1', subStageVisits: [] } as unknown as StageVisit,
    );

    expect(blocking).toEqual([
      expect.objectContaining({
        type: 'SUB_STAGE_COMPLETED',
        subStageId: 'sub-stage-1',
        satisfied: false,
      }),
    ]);
  });

  it('compte uniquement les approbateurs distincts', async () => {
    const manager = { query: jest.fn() } as unknown as EntityManager;
    const requirement = {
      id: 'double-approval',
      type: ProcedureRequirementType.APPROVAL,
      approvalCount: 2,
      approvalRole: 'avocat',
    };
    const oneActor = await service.evaluate(
      manager,
      'instance-1',
      {
        id: 'visit-1',
        metadata: {
          approvals: [
            { actorId: '7', role: 'avocat', approved: true },
            { actorId: '7', role: 'avocat', approved: true },
          ],
        },
      } as SubStageVisit,
      [requirement],
    );
    const twoActors = await service.evaluate(
      manager,
      'instance-1',
      {
        id: 'visit-1',
        metadata: {
          approvals: [
            { actorId: '7', role: 'avocat', approved: true },
            { actorId: '8', role: 'avocat', approved: true },
          ],
        },
      } as SubStageVisit,
      [requirement],
    );

    expect(oneActor[0].satisfied).toBe(false);
    expect(twoActors[0].satisfied).toBe(true);
  });

  it('ignore une sous-étape optionnelle non exécutée', async () => {
    const manager = { query: jest.fn() } as unknown as EntityManager;
    const blocking = await service.getStageBlockingRequirements(
      manager,
      'instance-1',
      {
        id: 'stage-1',
        subStages: [
          {
            id: 'optional',
            name: 'Médiation facultative',
            isMandatory: false,
            requirements: [
              {
                id: 'audience',
                type: ProcedureRequirementType.AUDIENCE_HELD,
              },
            ],
          },
        ],
      } as unknown as Stage,
      { id: 'stage-visit-1', subStageVisits: [] } as unknown as StageVisit,
    );

    expect(blocking).toEqual([]);
    expect((manager.query as jest.Mock)).not.toHaveBeenCalled();
  });
});
