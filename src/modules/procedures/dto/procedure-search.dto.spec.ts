import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ProcedureSearchDto } from './procedure-search.dto';

describe('ProcedureSearchDto', () => {
  it('accepte une recherche sans filtre is_active', async () => {
    const dto = plainToInstance(ProcedureSearchDto, {
      page: '1',
      limit: '10',
      sort_by: 'name',
      sort_direction: 'ASC',
    });

    const errors = await validate(dto);

    expect(
      errors.find(({ property }) => property === 'is_active'),
    ).toBeUndefined();
    expect(
      (dto as ProcedureSearchDto & { sort_order?: string }).sort_order,
    ).toBeUndefined();
  });

  it.each([
    ['0', 0],
    ['1', 1],
  ])('convertit is_active=%s en nombre %i', async (value, expected) => {
    const dto = plainToInstance(ProcedureSearchDto, { is_active: value });

    const errors = await validate(dto);

    expect(
      errors.find(({ property }) => property === 'is_active'),
    ).toBeUndefined();
    expect(dto.is_active).toBe(expected);
  });

  it('refuse une valeur is_active différente de 0 ou 1', async () => {
    const dto = plainToInstance(ProcedureSearchDto, { is_active: '2' });

    const errors = await validate(dto);
    const isActiveError = errors.find(
      ({ property }) => property === 'is_active',
    );

    expect(isActiveError?.constraints).toMatchObject({
      isIn: 'is_active doit être 0 ou 1',
    });
  });
});
