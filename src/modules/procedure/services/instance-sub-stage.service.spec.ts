import { BadRequestException } from '@nestjs/common';
import { ProcedureInstance } from '../entities/procedure-instance.entity';
import { InstanceMapperService } from './instance-sub-stage.service';

describe('InstanceMapperService — visites canoniques', () => {
  const mapper = new InstanceMapperService();

  const stages = [
    {
      id: 'stage-1',
      name: 'Préparation',
      description: null,
      order: 1,
      canBeSkipped: false,
      canBeReentered: false,
      subStages: [
        {
          id: 'sub-stage-1',
          name: 'Mandat',
          order: 1,
          isMandatory: true,
        },
      ],
    },
    {
      id: 'stage-2',
      name: 'Audience',
      description: null,
      order: 2,
      canBeSkipped: false,
      canBeReentered: false,
      subStages: [
        {
          id: 'sub-stage-2',
          name: 'Convocation',
          order: 1,
          isMandatory: true,
        },
      ],
    },
  ] as any[];

  it('utilise la dernière visite propre à chaque étape', async () => {
    const previousVisit = {
      stageId: 'stage-1',
      visitNumber: 1,
      exitedAt: new Date(),
      subStageVisits: [
        {
          subStageId: 'sub-stage-1',
          isCompleted: true,
          metadata: {},
        },
      ],
    } as any;
    const currentVisit = {
      stageId: 'stage-2',
      visitNumber: 1,
      exitedAt: null,
      subStageVisits: [
        {
          subStageId: 'sub-stage-2',
          isCompleted: false,
          metadata: {},
        },
      ],
    } as any;
    const instance = Object.assign(new ProcedureInstance(), {
      currentStageId: 'stage-2',
      stageVisits: [previousVisit, currentVisit],
      completedSubStages: [],
      status: 'ACTIVE',
    });

    const result = await mapper.mapInstanceWithCurrentTemplate(
      instance,
      { stages } as any,
      currentVisit,
    );

    expect(result.stages[0]).toMatchObject({
      id: 'stage-1',
      status: 'completed',
      progress: 100,
    });
    expect(result.stages[1]).toMatchObject({
      id: 'stage-2',
      status: 'current',
      progress: 0,
    });
    expect(result.progress).toBe(50);
  });

  it('refuse une étape courante étrangère au snapshot', async () => {
    const currentVisit = {
      stageId: 'foreign-stage',
      visitNumber: 1,
      subStageVisits: [],
    } as any;
    const instance = Object.assign(new ProcedureInstance(), {
      currentStageId: 'foreign-stage',
      stageVisits: [currentVisit],
      completedSubStages: [],
    });

    await expect(
      mapper.mapInstanceWithCurrentTemplate(
        instance,
        { stages } as any,
        currentVisit,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
