import { FindingsController } from './finding.controller';

describe('FindingsController resource policies', () => {
  const service = {
    create: jest.fn(),
    findAll: jest.fn(),
    getAccessScope: jest.fn(),
    getDiligenceAccessScope: jest.fn(),
    startAnalysis: jest.fn(),
    waive: jest.fn(),
  };
  const resourcePolicy = {
    assertDossierAccess: jest.fn(),
    getAccessibleDossierIdsAtLevel: jest.fn(),
  };
  const user = { userId: 42 };
  let controller: FindingsController;

  beforeEach(() => {
    jest.clearAllMocks();
    resourcePolicy.assertDossierAccess.mockResolvedValue(undefined);
    resourcePolicy.getAccessibleDossierIdsAtLevel.mockResolvedValue([12]);
    service.getAccessScope.mockResolvedValue({
      dossierId: 12,
      confidentialityLevel: 1,
    });
    service.getDiligenceAccessScope.mockResolvedValue({
      dossierId: 12,
      confidentialityLevel: 1,
    });
    controller = new FindingsController(
      service as any,
      resourcePolicy as any,
    );
  });

  it('contrôle la diligence avant création et impose l’auteur JWT', async () => {
    const dto = { diligence_id: 5 };
    await controller.create(dto as any, user);

    expect(service.getDiligenceAccessScope).toHaveBeenCalledWith(5);
    expect(resourcePolicy.assertDossierAccess).toHaveBeenCalledWith(
      12,
      user,
      'write',
      'create_diligence_finding',
      1,
    );
    expect(service.create).toHaveBeenCalledWith(dto, 42);
  });

  it('contrôle le dossier avant le démarrage de l’analyse', async () => {
    await controller.startAnalysis(3, user);

    expect(service.getAccessScope).toHaveBeenCalledWith(3);
    expect(service.startAnalysis).toHaveBeenCalledWith(3, 42);
  });

  it('transmet l’acteur et la justification à l’acceptation du risque', async () => {
    await controller.waive(
      3,
      'Risque accepté par le responsable du dossier',
      user,
    );

    expect(service.waive).toHaveBeenCalledWith(
      3,
      'Risque accepté par le responsable du dossier',
      42,
    );
  });

  it('limite les listes aux dossiers accessibles confidentiels', async () => {
    await controller.findAll(user);

    expect(
      resourcePolicy.getAccessibleDossierIdsAtLevel,
    ).toHaveBeenCalledWith(user, 1);
    expect(service.findAll).toHaveBeenCalledWith([12]);
  });
});
