import { DiligencesController } from './diligence.controller';

describe('DiligencesController resource policies', () => {
  const service = {
    create: jest.fn(),
    findAll: jest.fn(),
    getAccessScope: jest.fn(),
    start: jest.fn(),
  };
  const statsService = { getStats: jest.fn() };
  const resourcePolicy = {
    assertDossierAccess: jest.fn(),
    getAccessibleDossierIdsAtLevel: jest.fn(),
  };
  const user = { userId: 42 };
  let controller: DiligencesController;

  beforeEach(() => {
    jest.clearAllMocks();
    resourcePolicy.assertDossierAccess.mockResolvedValue(undefined);
    resourcePolicy.getAccessibleDossierIdsAtLevel.mockResolvedValue([10, 11]);
    service.getAccessScope.mockResolvedValue({
      dossierId: 10,
      confidentialityLevel: 1,
    });
    controller = new DiligencesController(
      service as any,
      statsService as any,
      resourcePolicy as any,
    );
  });

  it('contrôle le dossier confidentiel avant la création et impose l’acteur JWT', async () => {
    const dto = { dossier_id: 10 };
    await controller.create(dto as any, user);

    expect(resourcePolicy.assertDossierAccess).toHaveBeenCalledWith(
      10,
      user,
      'write',
      'create_diligence',
      1,
    );
    expect(service.create).toHaveBeenCalledWith(dto, 42);
  });

  it('limite les listes aux dossiers accessibles au niveau confidentiel', async () => {
    await controller.findAll(user);

    expect(
      resourcePolicy.getAccessibleDossierIdsAtLevel,
    ).toHaveBeenCalledWith(user, 1);
    expect(service.findAll).toHaveBeenCalledWith([10, 11]);
  });

  it('contrôle la ressource avant une transition', async () => {
    await controller.start(7, user);

    expect(service.getAccessScope).toHaveBeenCalledWith(7);
    expect(resourcePolicy.assertDossierAccess).toHaveBeenCalledWith(
      10,
      user,
      'write',
      'edit_diligence',
      1,
    );
    expect(service.start).toHaveBeenCalledWith(7, 42);
  });
});
