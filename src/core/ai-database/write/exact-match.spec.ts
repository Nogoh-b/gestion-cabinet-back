import { describe, expect, it } from '@jest/globals';
import { matchTier, pickDeterministic, searchWords } from './exact-match';

describe('matchTier', () => {
  it('reconnaît une valeur identique malgré la casse, les accents et la ponctuation', () => {
    expect(matchTier('dos 2026 0001', ['DOS-2026-0001'])).toBe('exact');
    expect(matchTier('DOS20260001', ['DOS-2026-0001'])).toBe('exact');
    expect(matchTier('helene kamdem', ['Hélène Kamdem'])).toBe('exact');
    expect(matchTier('jean.dupont@mail.fr', ['Jean.Dupont@mail.fr'])).toBe('exact');
  });

  it('exige des mots entiers, pas des morceaux de mots', () => {
    expect(matchTier('Dupont', ['Jean Dupont'])).toBe('words');
    expect(matchTier('Dupont', ['Jean', 'Dupont'])).toBe('exact');
    expect(matchTier('Jean', ['Jeannot', 'Martin'])).toBe('prefix');
    expect(matchTier('Kamden', ['Brice', 'Kamdem'])).toBeNull();
  });

  it('ignore civilités et articles', () => {
    expect(matchTier('Maître Dupont', ['Paul Dupont'])).toBe('words');
    expect(matchTier('Mme la Ministre', ['Ministre'])).toBe('words');
  });

  it('classe un seul mot commun en simple proposition', () => {
    expect(matchTier('Brice Kamden', ['Brice', 'Kamdem'])).toBe('partial');
  });
});

describe('pickDeterministic', () => {
  const rows = [
    { id: 1, code: 'PARTICULIER', label: 'Particulier' },
    { id: 2, code: 'PROFESSIONNEL', label: 'Professionnel' },
  ];
  const texts = (r: (typeof rows)[number]) => [r.code, r.label];

  it('retient un enregistrement unique au niveau exact ou tous les mots', () => {
    expect(pickDeterministic('particulier', rows, texts).best).toEqual(rows[0]);
  });

  it('n’accepte une abréviation que pour un référentiel', () => {
    expect(pickDeterministic('PART', rows, texts).best).toBeNull();
    expect(pickDeterministic('PART', rows, texts, { allowPrefix: true }).best).toEqual(rows[0]);
    expect(pickDeterministic('PRO', rows, texts, { allowPrefix: true }).best).toEqual(rows[1]);
    // « P » commence les deux : jamais de choix arbitraire.
    const pick = pickDeterministic('P', rows, texts, { allowPrefix: true });
    expect(pick.best).toBeNull();
  });

  it('signale l’ambiguïté au lieu de choisir', () => {
    const twins = [
      { id: 3, name: 'Jean Dupont' },
      { id: 4, name: 'Jean Dupont' },
    ];
    const pick = pickDeterministic('Jean Dupont', twins, (r) => [r.name]);
    expect(pick.best).toBeNull();
    expect(pick.ambiguous).toBe(true);
    expect(pick.matches.map((m) => m.entity.id)).toEqual([3, 4]);
  });

  it('préfère le niveau le plus sûr : un exact unique l’emporte sur des correspondances par mots', () => {
    const people = [
      { id: 5, name: 'Jean Dupont' },
      { id: 6, name: 'Jean Dupont Martin' },
    ];
    expect(pickDeterministic('Jean Dupont', people, (r) => [r.name]).best).toEqual(people[0]);
  });
});

describe('searchWords', () => {
  it('retire les civilités et trie le mot le plus distinctif en premier', () => {
    expect(searchWords('Maître Jean Dupontel')).toEqual(['dupontel', 'jean']);
    expect(searchWords('DOS-2026-0001')).toEqual(['2026', '0001', 'dos']);
  });
});
