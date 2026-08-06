import { EntityMetadata, Repository } from 'typeorm';
import { PaginationParamsDto } from '../../dto/pagination-params.dto';
import { PaginationServiceV1 } from './paginations-v1.service';

type TestEntity = {
  [key: string]: unknown;
  id: number;
  name: string;
};

function createRepository(columns: string[]) {
  const findAndCount = jest.fn().mockResolvedValue([[], 0]);
  const metadata = {
    hasColumnWithPropertyPath: (propertyPath: string) =>
      columns.includes(propertyPath),
    findRelationWithPropertyPath: () => undefined,
    primaryColumns: [{ propertyPath: 'id' }],
  } as unknown as EntityMetadata;

  return {
    repository: {
      metadata,
      findAndCount,
    } as unknown as Repository<TestEntity>,
    findAndCount,
  };
}

describe('PaginationServiceV1 sort sanitization', () => {
  it('utilise le tri par défaut quand sort_by ne correspond pas à une colonne', async () => {
    const { repository, findAndCount } = createRepository(['id', 'name']);
    const service = new PaginationServiceV1();

    await service.paginate(
      repository,
      {
        page: 1,
        limit: 10,
        sort_by: 'sort_order',
        sort_direction: 'ASC',
      } as PaginationParamsDto,
      {},
      [],
      { order: { name: 'ASC' } },
    );

    expect(findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({ order: { name: 'ASC' } }),
    );
  });
});
