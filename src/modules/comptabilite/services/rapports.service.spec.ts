import { runWithTenantContext } from 'src/core/tenant/tenant.context';
import {
  StatutEcriture,
  StatutExercice,
} from '../enums/comptabilite.enums';
import { RapportsService } from './rapports.service';

describe('RapportsService - isolation et écritures définitives', () => {
  const queryBuilder: Record<string, jest.Mock> = {};
  for (const method of [
    'select',
    'addSelect',
    'innerJoin',
    'innerJoinAndSelect',
    'leftJoinAndSelect',
    'where',
    'andWhere',
    'groupBy',
    'orderBy',
    'addOrderBy',
  ]) {
    queryBuilder[method] = jest.fn(() => queryBuilder);
  }
  queryBuilder.getRawMany = jest.fn(async () => []);
  queryBuilder.getMany = jest.fn(async () => []);

  const compteRepo = {
    find: jest.fn(async () => []),
    findOne: jest.fn(),
  };
  const ligneRepo = {
    createQueryBuilder: jest.fn(() => queryBuilder),
  };
  const exerciceRepo = {
    findOne: jest.fn(),
  };
  let service: RapportsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new RapportsService(
      compteRepo as any,
      ligneRepo as any,
      {} as any,
      exerciceRepo as any,
    );
    exerciceRepo.findOne.mockResolvedValue({
      id: 33,
      annee: 2026,
      statut: StatutExercice.OUVERT,
      tenant_id: 7,
    });
  });

  it('borne la balance au cabinet et exclut les brouillons', async () => {
    await runWithTenantContext(7, () => service.getBalance(33));

    expect(exerciceRepo.findOne).toHaveBeenCalledWith({
      where: { id: 33, tenant_id: 7 },
    });
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'e.tenant_id = :tenantId',
      { tenantId: 7 },
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'e.status IN (:...entryStatuses)',
      {
        entryStatuses: [
          StatutEcriture.POSTED,
          StatutEcriture.REVERSED,
        ],
      },
    );
    expect(compteRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenant_id: 7 },
      }),
    );
  });

  it('refuse un exercice absent du cabinet courant', async () => {
    exerciceRepo.findOne.mockResolvedValue(null);

    await expect(
      runWithTenantContext(7, () => service.getBalance(99)),
    ).rejects.toThrow('Aucun exercice comptable');
  });
});
