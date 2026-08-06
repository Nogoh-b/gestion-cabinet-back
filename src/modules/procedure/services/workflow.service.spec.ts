import { WorkflowService } from './workflow.service';

describe('WorkflowService — conditions restrictives', () => {
  const service = new WorkflowService();

  it('accepte uniquement l’absence de condition par défaut', async () => {
    await expect(service.evaluateCondition(null, {})).resolves.toBe(true);
    await expect(service.evaluateCondition('', {})).resolves.toBe(true);
  });

  it.each(['{invalid-json', 'true', '[]', 1, []])(
    'refuse une condition illisible ou non objet : %p',
    async (condition) => {
      await expect(service.evaluateCondition(condition, {})).resolves.toBe(
        false,
      );
    },
  );

  it('exige un résultat booléen strictement vrai', async () => {
    await expect(
      service.evaluateCondition(
        { var: 'stageVisit.visitNumber' },
        { stageVisit: { visitNumber: 2 } },
      ),
    ).resolves.toBe(false);
    await expect(
      service.evaluateCondition(
        { '==': [{ var: 'stageVisit.visitNumber' }, 2] },
        { stageVisit: { visitNumber: 2 } },
      ),
    ).resolves.toBe(true);
  });

  it('alimente les alias de condition depuis les visites uniquement', async () => {
    await expect(
      service.evaluateCondition(
        {
          in: [
            'sub-stage-1',
            { var: 'instance.completedSubStages' },
          ],
        },
        {
          instance: {
            completedSubStages: ['legacy-instance'],
          },
          stageVisit: {
            subStageVisits: [
              { subStageId: 'sub-stage-1', isCompleted: true },
            ],
          },
        },
      ),
    ).resolves.toBe(true);
    await expect(
      service.evaluateCondition(
        {
          in: [
            'legacy-instance',
            { var: 'instance.completedSubStages' },
          ],
        },
        {
          instance: {
            completedSubStages: ['legacy-instance'],
          },
          stageVisit: { subStageVisits: [] },
        },
      ),
    ).resolves.toBe(false);
  });
});
