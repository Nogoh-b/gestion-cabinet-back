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
      expect.objectContaining({ entity: expect.objectContaining({ id: 10 }) }),
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
        best: expect.objectContaining({ id: 11 }),
      }),
    );
  });

  it('accepte le nom dans l’autre sens et ignore la civilité', async () => {
    const resolver = createResolver([
      { id: 14, first_name: 'Brice', last_name: 'Kamdem' },
    ]);

    expect((await resolver.resolve('Kamdem Brice')).best).toEqual(expect.objectContaining({ id: 14 }));
    expect((await resolver.resolve('M. Kamdem')).best).toEqual(expect.objectContaining({ id: 14 }));
  });

  it('ne devine jamais : une faute de frappe est seulement proposée', async () => {
    const resolver = createResolver([
      { id: 12, first_name: 'Brice', last_name: 'Kamdem' },
    ]);

    const result = await resolver.resolve('Brice Kamden');

    expect(result.found).toBe(false);
    expect(result.ambiguous).toBe(false);
    expect(result.candidates.map((c) => c.entity.id)).toEqual([12]);
  });

  it('demande de choisir quand deux clients portent le même nom', async () => {
    const resolver = createResolver([
      { id: 20, first_name: 'Jean', last_name: 'Dupont', email: 'a@x.fr' },
      { id: 21, first_name: 'Jean', last_name: 'Dupont', email: 'b@x.fr' },
    ]);

    const result = await resolver.resolve('Jean Dupont');

    expect(result.found).toBe(false);
    expect(result.ambiguous).toBe(true);
    expect(result.candidates.map((c) => c.entity.id)).toEqual([20, 21]);
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
