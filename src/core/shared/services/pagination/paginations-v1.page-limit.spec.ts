import { Repository } from 'typeorm';

import { PaginationParamsDto } from '../../dto/pagination-params.dto';
import { PaginationServiceV1 } from './paginations-v1.service';

describe('PaginationServiceV1.paginate — page/limit', () => {
  let service: PaginationServiceV1;
  let findAndCount: jest.Mock;
  let repository: Repository<any>;

  beforeEach(() => {
    service = new PaginationServiceV1();
    findAndCount = jest.fn().mockResolvedValue([[], 42]);
    repository = {
      metadata: { columns: [], relations: [] },
      findAndCount,
    } as unknown as Repository<any>;
  });

  // Sans ValidationPipe global, les @Query() arrivent bruts (strings, absents…).
  const paginate = (params: Record<string, unknown>) =>
    service.paginate(repository, params as unknown as PaginationParamsDto);

  const skipTake = () => {
    const { skip, take } = findAndCount.mock.calls[0][0];
    return { skip, take };
  };

  it('applique page=1 et limit=10 quand ils sont absents', async () => {
    const result = await paginate({});

    expect(skipTake()).toEqual({ skip: 0, take: 10 });
    expect(result.meta).toMatchObject({
      page: 1,
      limit: 10,
      total: 42,
      total_pages: 5,
      has_previous: false,
      has_next: true,
    });
  });

  it('conserve les valeurs fournies en string', async () => {
    const result = await paginate({ page: '2', limit: '5' });

    expect(skipTake()).toEqual({ skip: 5, take: 5 });
    expect(result.meta).toMatchObject({ page: 2, limit: 5 });
  });

  it('retombe sur la page 1 pour une page non numérique', async () => {
    const result = await paginate({ page: 'abc' });

    expect(skipTake()).toEqual({ skip: 0, take: 10 });
    expect(result.meta).toMatchObject({ page: 1, limit: 10 });
  });

  it.each([
    [{ page: '0', limit: '0' }, { skip: 0, take: 10 }],
    [{ page: '-3', limit: '-1' }, { skip: 0, take: 10 }],
    [{ page: '', limit: '' }, { skip: 0, take: 10 }],
    [{ page: '2.7', limit: '5.9' }, { skip: 5, take: 5 }],
  ])('normalise %j', async (params, expected) => {
    await paginate(params);

    expect(skipTake()).toEqual(expected);
  });

  it('plafonne limit à 500 sans toucher aux valeurs inférieures', async () => {
    await paginate({ page: '1', limit: '500' });
    await paginate({ page: '1', limit: '10000' });

    expect(findAndCount.mock.calls[0][0].take).toBe(500);
    expect(findAndCount.mock.calls[1][0].take).toBe(500);
  });
});
