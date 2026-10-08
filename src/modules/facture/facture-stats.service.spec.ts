import { describe, expect, it, jest } from '@jest/globals';
import { Repository } from 'typeorm';

import { StatutFacture } from './dto/create-facture.dto';
import { Facture } from './entities/facture.entity';
import { FactureStatsService } from './facture-stats.service';

interface FactureStatsInternals {
  getTotalTTC(): Promise<number>;
  getUnpaidCount(): Promise<number>;
}

describe('FactureStatsService - factures annulées', () => {
  const createService = () => {
    const queryBuilder = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawOne: jest
        .fn<() => Promise<{ total: string }>>()
        .mockResolvedValue({ total: '100000' }),
      getCount: jest.fn<() => Promise<number>>().mockResolvedValue(1),
    };
    const repository = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    };
    return {
      service: new FactureStatsService(
        repository as unknown as Repository<Facture>,
      ) as unknown as FactureStatsInternals,
      queryBuilder,
    };
  };

  it('exclut les annulées du montant total TTC', async () => {
    const { service, queryBuilder } = createService();

    await service.getTotalTTC();

    expect(queryBuilder.where).toHaveBeenCalledWith(
      'facture.status != :cancelled',
      { cancelled: StatutFacture.ANNULEE },
    );
  });

  it('ne classe pas une facture annulée parmi les impayées', async () => {
    const { service, queryBuilder } = createService();

    await service.getUnpaidCount();

    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'facture.status != :cancelled',
      { cancelled: StatutFacture.ANNULEE },
    );
  });
});
