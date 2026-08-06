import { AudiencesController } from './audiences.controller';

describe('AudiencesController - politiques de ressource', () => {
  const audiencesService = {
    getAudienceDossierId: jest.fn().mockResolvedValue(44),
    findOneV1: jest.fn().mockResolvedValue({ id: 7 }),
    validateReport: jest.fn().mockResolvedValue({ id: 7 }),
  };
  const decisionService = {
    addDecision: jest.fn().mockResolvedValue({ id: 7 }),
  };
  const resourcePolicy = {
    assertDossierAccess: jest.fn().mockResolvedValue({}),
  };
  const controller = new AudiencesController(
    audiencesService as any,
    decisionService as any,
    {} as any,
    resourcePolicy as any,
  );
  const user = {
    id: 5,
    userId: 5,
    tenantId: 2,
    role: 'avocat',
    permissions: ['confirm_audience', 'edit_audience'],
  };

  beforeEach(() => jest.clearAllMocks());

  it('contrôle le dossier avant d’ajouter une décision', async () => {
    await controller.addDecision(
      '7',
      { decision: 'Décision', decision_date: new Date() },
      user,
    );

    expect(resourcePolicy.assertDossierAccess).toHaveBeenCalledWith(
      44,
      expect.objectContaining({ userId: 5, tenantId: 2 }),
      'write',
      'confirm_audience',
    );
    expect(decisionService.addDecision).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ decision: 'Décision' }),
      expect.objectContaining({ userId: 5, tenantId: 2 }),
    );
  });

  it('contrôle le dossier avant de valider un rapport', async () => {
    await controller.validateReport('7', user);
    expect(resourcePolicy.assertDossierAccess).toHaveBeenCalledWith(
      44,
      expect.any(Object),
      'write',
      'edit_audience',
    );
    expect(audiencesService.validateReport).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ userId: 5 }),
    );
  });
});
