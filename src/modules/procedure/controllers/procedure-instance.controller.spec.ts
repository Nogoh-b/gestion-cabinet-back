import { ProcedureInstanceController } from './procedure-instance.controller';

describe('ProcedureInstanceController — commandes sûres', () => {
  it("n'expose plus de commande générique de simulation d'événement", () => {
    const controller = new ProcedureInstanceController(
      {} as any,
      {} as any,
    );

    expect((controller as any).triggerEvent).toBeUndefined();
  });

  it("la consultation d'une étape reste strictement en lecture seule", async () => {
    const navigateToStage = jest.fn().mockResolvedValue({
      instance: { id: 'instance-1' },
      targetStage: { id: 'stage-1' },
      canCompleteSubStages: false,
    });
    const assertProcedureInstanceAccess = jest.fn();
    const controller = new ProcedureInstanceController(
      { navigateToStage } as any,
      { assertProcedureInstanceAccess } as any,
    );

    await controller.navigateToStage(
      'instance-1',
      'stage-1',
      { user: { id: 42 } },
    );

    expect(assertProcedureInstanceAccess).toHaveBeenCalledWith(
      'instance-1',
      { id: 42 },
    );
    expect(navigateToStage).toHaveBeenCalledWith(
      'instance-1',
      'stage-1',
    );
  });
});
