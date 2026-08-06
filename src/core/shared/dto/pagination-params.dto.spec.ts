import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  PaginationParamsDto,
  SortDirection,
} from './pagination-params.dto';

describe('PaginationParamsDto', () => {
  it.each([
    ['asc', SortDirection.ASC],
    ['ASC', SortDirection.ASC],
    ['desc', SortDirection.DESC],
    ['DESC', SortDirection.DESC],
  ])('normalise la direction %s', async (input, expected) => {
    const dto = plainToInstance(PaginationParamsDto, {
      sort_direction: input,
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.sort_direction).toBe(expected);
  });

  it('refuse une direction inconnue', async () => {
    const dto = plainToInstance(PaginationParamsDto, {
      sort_direction: 'sideways',
    });

    await expect(validate(dto)).resolves.not.toHaveLength(0);
  });
});
