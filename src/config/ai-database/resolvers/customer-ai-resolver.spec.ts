import { describe, expect, it, jest } from '@jest/globals';
import { Repository } from 'typeorm';
import { Customer } from 'src/modules/customer/customer/entities/customer.entity';
import { CustomerAiResolver } from './customer-ai-resolver';

describe('CustomerAiResolver', () => {
  const createResolver = (customers: Partial<Customer>[]) => {
    const repository = {
      find: jest.fn(async () => customers),
    } as unknown as Repository<Customer>;

    return new CustomerAiResolver(repository);
  };

  it('ne force pas un client qui partage seulement le même prénom', async () => {
    const resolver = createResolver([
      { id: 10, first_name: 'Brice', last_name: 'Mvondo' },
    ]);

    const result = await resolver.resolve('Brice Kamdem');

    expect(result.found).toBe(false);
    expect(result.best).toBeNull();
    expect(result.candidates[0]).toEqual(
      expect.objectContaining({
        entity: expect.objectContaining({ id: 10 }),
        score: 40,
      }),
    );
  });

  it('sélectionne une correspondance exacte sur le nom complet', async () => {
    const resolver = createResolver([
      { id: 11, first_name: 'Brice', last_name: 'Kamdem' },
    ]);

    const result = await resolver.resolve('Brice Kamdem');

    expect(result).toEqual(
      expect.objectContaining({
        found: true,
        ambiguous: false,
        score: 100,
        best: expect.objectContaining({ id: 11 }),
      }),
    );
  });

  it('tolère une petite faute dans le nom complet', async () => {
    const resolver = createResolver([
      { id: 12, first_name: 'Brice', last_name: 'Kamdem' },
    ]);

    const result = await resolver.resolve('Brice Kamden');

    expect(result.found).toBe(true);
    expect(result.best).toEqual(expect.objectContaining({ id: 12 }));
    expect(result.score).toBeGreaterThanOrEqual(70);
  });

  it('normalise correctement les accents', async () => {
    const resolver = createResolver([
      { id: 13, first_name: 'Hélène', last_name: 'Kamdem' },
    ]);

    const result = await resolver.resolve('Helene Kamdem');

    expect(result.found).toBe(true);
    expect(result.best).toEqual(expect.objectContaining({ id: 13 }));
  });
});
