import { EntityMetadata, Repository } from 'typeorm';
import { PaginationServiceV1 } from '../pagination/paginations-v1.service';
import {
  BaseServiceV1,
  SearchCriteria,
  SearchOptions,
} from './base-v1.service';

type TestEntity = {
  [key: string]: unknown;
  id: number;
  name: string;
  sort_order?: number;
};

function createMetadata(columns: string[]): EntityMetadata {
  return {
    hasColumnWithPropertyPath: (propertyPath: string) =>
      columns.includes(propertyPath),
    findRelationWithPropertyPath: () => undefined,
    primaryColumns: [{ propertyPath: 'id' }],
  } as unknown as EntityMetadata;
}

class TestSearchService extends BaseServiceV1<TestEntity> {
  constructor(columns: string[]) {
    super(
      { metadata: createMetadata(columns) } as Repository<TestEntity>,
      {} as PaginationServiceV1,
    );
  }

  protected getDefaultSearchOptions(): SearchOptions {
    return {
      searchFields: ['name'],
      exactMatchFields: ['id', 'sort_order'],
      dateRangeFields: [],
    };
  }

  buildWhere(criteria: SearchCriteria) {
    return this.buildWhereConditionsV1(criteria);
  }
}

describe('BaseServiceV1 query field sanitization', () => {
  it('ignore un paramètre qui ne correspond pas à une colonne TypeORM', () => {
    const service = new TestSearchService(['id', 'name']);

    expect(service.buildWhere({ sort_order: 'ASC' })).toEqual({});
  });

  it('conserve le même paramètre lorsque la colonne existe réellement', () => {
    const service = new TestSearchService(['id', 'name', 'sort_order']);

    expect(service.buildWhere({ sort_order: 2 })).toEqual({ sort_order: 2 });
  });
});
