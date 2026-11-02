import { ForbiddenException } from '@nestjs/common';
import { runWithTenantContext } from './tenant/tenant.context';
import { ResourcePolicyService } from './resource-policy.service';

describe('ResourcePolicyService', () => {
  const dossierRepository = {
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
  const memberQuery = {
    where: jest.fn(),
    andWhere: jest.fn(),
    getOne: jest.fn(),
  };
  const memberRepository = {
    createQueryBuilder: jest.fn(),
  };
  let service: ResourcePolicyService;

  const actor = {
    id: 20,
    tenantId: 2,
    role: 'avocat',
    permissions: ['view_documents'],
    customerId: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    memberQuery.where.mockReturnValue(memberQuery);
    memberQuery.andWhere.mockReturnValue(memberQuery);
    memberQuery.getOne.mockResolvedValue(null);
    memberRepository.createQueryBuilder.mockReturnValue(memberQuery);
    dossierRepository.findOne.mockResolvedValue({
      id: 12,
      confidentiality_level: false,
      lawyer: { id: 10 },
      client: { id: 30 },
      collaborators: [{ id: actor.id }],
    });
    service = new ResourcePolicyService(
      dossierRepository as any,
      memberRepository as any,
    );
  });

  it('refuse un acteur dont le JWT ne correspond pas au cabinet courant', async () => {
    await expect(
      runWithTenantContext(2, () =>
        service.assertDossierAccess(
          12,
          { ...actor, tenantId: 3 },
          'read',
          'view_documents',
        ),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(dossierRepository.findOne).not.toHaveBeenCalled();
  });

  it("n'utilise plus l'ancienne relation collaborators comme droit d'accès", async () => {
    await expect(
      runWithTenantContext(2, () =>
        service.assertDossierAccess(
          12,
          actor,
          'read',
          'view_documents',
        ),
      ),
    ).rejects.toThrow("Vous n'êtes pas membre de ce dossier");
  });

  it('refuse une ressource confidentielle au client du dossier', async () => {
    await expect(
      runWithTenantContext(2, () =>
        service.assertDossierAccess(
          12,
          {
            ...actor,
            id: 40,
            customerId: 30,
          },
          'read',
          'view_documents',
          1,
        ),
      ),
    ).rejects.toThrow(
      'Niveau de confidentialité insuffisant pour cette ressource',
    );
  });

  it('exige le niveau documentaire demandé pour un membre', async () => {
    memberQuery.getOne.mockResolvedValue({
      userId: actor.id,
      role: 'COLLABORATOR',
      confidentialityLevel: 0,
    });

    await expect(
      runWithTenantContext(2, () =>
        service.assertDossierAccess(
          12,
          actor,
          'read',
          'view_documents',
          1,
        ),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    memberQuery.getOne.mockResolvedValue({
      userId: actor.id,
      role: 'COLLABORATOR',
      confidentialityLevel: 1,
    });
    await expect(
      runWithTenantContext(2, () =>
        service.assertDossierAccess(
          12,
          actor,
          'read',
          'view_documents',
          1,
        ),
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        dossier: expect.objectContaining({ id: 12 }),
        member: expect.objectContaining({ confidentialityLevel: 1 }),
      }),
    );
  });
});
