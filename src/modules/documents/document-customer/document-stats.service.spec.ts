import { describe, expect, it, jest } from '@jest/globals';

import { DocumentStatsService } from './document-stats.service';

interface DocumentStatsInternals {
  getPendingCount(): Promise<number>;
  getValidatedCount(): Promise<number>;
}

describe('DocumentStatsService - statuts ENUM', () => {
  const createService = () => {
    const queryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getCount: jest.fn<() => Promise<number>>().mockResolvedValue(0),
    };
    const repository = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    };
    return {
      service: new DocumentStatsService(
        repository as never,
        {} as never,
        {} as never,
      ) as unknown as DocumentStatsInternals,
      queryBuilder,
    };
  };

  it('compare le statut en attente en texte (« 0 »), pas comme index d’ENUM', async () => {
    const { service, queryBuilder } = createService();

    await service.getPendingCount();

    expect(queryBuilder.where).toHaveBeenCalledWith(
      'document.status = :status',
      { status: '0' },
    );
  });

  it('compare le statut validé en texte', async () => {
    const { service, queryBuilder } = createService();

    await service.getValidatedCount();

    expect(queryBuilder.where).toHaveBeenCalledWith(
      'document.status = :status',
      { status: '1' },
    );
  });
});
