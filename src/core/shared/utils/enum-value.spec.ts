import { enumValue } from './enum-value';

describe('enumValue', () => {
  it('renvoie la valeur sous forme de texte, pas un index d’ENUM', () => {
    expect(enumValue(0)).toBe('0');
    expect(enumValue(3)).toBe('3');
    expect(enumValue('ACTIONS_V2')).toBe('ACTIONS_V2');
  });

  it('sert directement de callback à map', () => {
    expect([2, 3].map(enumValue)).toEqual(['2', '3']);
  });
});
