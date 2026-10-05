import { describe, expect, it } from '@jest/globals';

import { generateUsernameBase, joinFullName, splitFullName } from './full-name.util';

describe('splitFullName', () => {
  it('met un terme à un seul mot dans le nom (le plus probable en recherche)', () => {
    expect(splitFullName('Diallo')).toEqual({ first_name: '', last_name: 'Diallo' });
  });

  it('répartit prénom puis nom sur un terme à deux mots', () => {
    expect(splitFullName('Awa Diallo')).toEqual({
      first_name: 'Awa',
      last_name: 'Diallo',
    });
  });

  it('regroupe tous les mots suivants dans le nom', () => {
    expect(splitFullName('Jean de la Fontaine')).toEqual({
      first_name: 'Jean',
      last_name: 'de la Fontaine',
    });
  });

  it('ignore les espaces superflus', () => {
    expect(splitFullName('  Awa   Diallo  ')).toEqual({
      first_name: 'Awa',
      last_name: 'Diallo',
    });
  });

  it('renvoie des chaînes vides pour une entrée vide ou absente', () => {
    expect(splitFullName('')).toEqual({ first_name: '', last_name: '' });
    expect(splitFullName('   ')).toEqual({ first_name: '', last_name: '' });
    expect(splitFullName(null)).toEqual({ first_name: '', last_name: '' });
    expect(splitFullName(undefined)).toEqual({ first_name: '', last_name: '' });
  });
});

describe('joinFullName', () => {
  it('concatène prénom et nom', () => {
    expect(joinFullName('Awa', 'Diallo')).toBe('Awa Diallo');
  });

  it('ignore la partie manquante', () => {
    expect(joinFullName('Awa', '')).toBe('Awa');
    expect(joinFullName('', 'Diallo')).toBe('Diallo');
    expect(joinFullName(null, undefined)).toBe('');
  });

  it('élague les espaces de chaque partie', () => {
    expect(joinFullName('  Awa  ', '  Diallo  ')).toBe('Awa Diallo');
  });
});

describe('generateUsernameBase', () => {
  it('minuscule et sépare les mots par un point', () => {
    expect(generateUsernameBase('Awa Diallo')).toBe('awa.diallo');
  });

  it('retire les accents', () => {
    expect(generateUsernameBase('Éric Nguyễn')).toBe('eric.nguyen');
  });

  it('retire la ponctuation non alphanumérique', () => {
    expect(generateUsernameBase("Jean-d'Arc O'Brien")).toBe('jeandarc.obrien');
  });

  it('retombe sur "membre" pour une entrée vide ou absente', () => {
    expect(generateUsernameBase('')).toBe('membre');
    expect(generateUsernameBase('   ')).toBe('membre');
    expect(generateUsernameBase(null)).toBe('membre');
    expect(generateUsernameBase(undefined)).toBe('membre');
  });
});
