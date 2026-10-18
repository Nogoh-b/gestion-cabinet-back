import { BaseServiceV1, SearchOptions } from './base-v1.service';

class AudienceLikeService extends BaseServiceV1<any> {
  constructor() {
    super({} as any, {} as any);
  }

  protected getDefaultSearchOptions(): SearchOptions {
    return {
      searchFields: ['judge_name'],
      exactMatchFields: ['id', 'status'],
      dateRangeFields: ['audience_date', 'created_at'],
    };
  }

  where(criteria: Record<string, any>) {
    return this.buildWhereConditionsV1(criteria, {});
  }
}

describe('BaseServiceV1 — plages <champ>_from / <champ>_to', () => {
  const service = new AudienceLikeService();

  it('filtre la période demandée (bornes incluses, journée entière en fin)', () => {
    const where: any = service.where({
      page: '1',
      limit: '500',
      audience_date_from: '2026-10-01',
      audience_date_to: '2026-10-31',
    });
    expect(where.audience_date._type).toBe('between');
    expect(where.audience_date._value).toEqual([
      '2026-10-01',
      '2026-10-31 23:59:59',
    ]);
    expect(where.audience_date_from).toBeUndefined();
  });

  it('accepte une seule borne', () => {
    const where: any = service.where({ audience_date_from: '2026-10-19' });
    expect(where.audience_date._type).toBe('moreThanOrEqual');
    expect(where.audience_date._value).toBe('2026-10-19');
  });

  it('se combine avec la recherche texte (chaque branche OU garde la période)', () => {
    const where: any = service.where({
      search: 'Mballa',
      audience_date_from: '2026-10-01',
      audience_date_to: '2026-10-31',
    });
    expect(Array.isArray(where)).toBe(true);
    expect(where[0].audience_date._type).toBe('between');
  });

  it('ignore les champs hors dateRangeFields et les dates invalides', () => {
    const where: any = service.where({
      foo_from: '2026-10-01',
      audience_date_to: 'pas-une-date',
    });
    expect(where).toEqual({});
  });
});
