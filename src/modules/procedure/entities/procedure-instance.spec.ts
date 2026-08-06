import { ProcedureInstance } from './procedure-instance.entity';

describe('ProcedureInstance — projections calculées', () => {
  it('calcule les complétions exclusivement depuis les visites', () => {
    const instance = new ProcedureInstance();
    instance.stageVisits = [
      {
        stageId: 'stage-1',
        visitNumber: 1,
        subStageVisits: [
          { subStageId: 'sub-stage-1', isCompleted: true },
          { subStageId: 'sub-stage-2', isCompleted: false },
        ],
      } as any,
    ];

    expect(instance.completedSubStageIds).toEqual(['sub-stage-1']);
    expect(instance.completedSubStageIds).not.toContain('legacy-instance');
  });

  it('ne considère jamais une transition conditionnelle comme satisfaite dans l’entité', () => {
    const instance = new ProcedureInstance();
    instance.currentStageId = 'stage-1';
    instance.currentStage = { id: 'stage-1', order: 1 } as any;
    instance.stageVisits = [];
    instance.template = {
      stages: [
        { id: 'stage-1', order: 1 },
        { id: 'stage-2', order: 2 },
      ],
      transitions: [
        {
          fromStageId: 'stage-1',
          toStageId: 'stage-2',
          condition: JSON.stringify({ '==': [1, 1] }),
        },
      ],
    } as any;

    expect(instance.isOnLastStageAdvanced).toEqual({
      isLast: false,
      reason: 'Transitions conditionnelles à évaluer par le moteur de workflow',
      confidence: 'low',
    });
  });
});
