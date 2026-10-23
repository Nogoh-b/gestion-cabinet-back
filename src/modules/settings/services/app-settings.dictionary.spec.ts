/// <reference types="jest" />
import { AppSettingsService, DICTIONARY_LIMIT, normalizeDictionaryWord } from './app-settings.service';

function serviceWith(words: string[] | null) {
  const cabinet = { id: 25, custom_dictionary: words };
  const repository = {
    findOne: jest.fn(async () => cabinet),
    update: jest.fn(async (_where: unknown, patch: any) => { cabinet.custom_dictionary = patch.custom_dictionary; }),
  };
  return { service: new AppSettingsService(repository as any, {} as any), repository, cabinet };
}

describe('Dictionnaire du cabinet (correcteur des éditeurs)', () => {
  it('garde les mots valides, sans doublon, apostrophe typographique ramenée', async () => {
    const { service, repository } = serviceWith(['OHADA']);
    const words = await service.addDictionaryWords(25, ['AUDCG', 'OHADA', 'l’Acte', ' ', '<script>', 'AUDCG']);
    expect(words).toEqual(['OHADA', 'AUDCG', "l'Acte"]);
    expect(repository.update).toHaveBeenCalledWith({ id: 25 }, { custom_dictionary: ['OHADA', 'AUDCG', "l'Acte"] });
  });

  it("n'écrit rien quand tous les mots sont déjà connus", async () => {
    const { service, repository } = serviceWith(['OHADA']);
    expect(await service.addDictionaryWords(25, ['OHADA'])).toEqual(['OHADA']);
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('plafonne la liste (les plus anciens mots partent)', async () => {
    const full = Array.from({ length: DICTIONARY_LIMIT }, (_, index) => `mot${'a'.repeat(index % 50)}x${index}`.replace(/\d/g, 'z'));
    const { service } = serviceWith(full);
    const words = await service.addDictionaryWords(25, ['Nouveaumot']);
    expect(words).toHaveLength(DICTIONARY_LIMIT);
    expect(words[words.length - 1]).toBe('Nouveaumot');
  });

  it('refuse chiffres, espaces et mots trop longs', () => {
    expect(normalizeDictionaryWord('DOS-2026')).toBeNull();
    expect(normalizeDictionaryWord('deux mots')).toBeNull();
    expect(normalizeDictionaryWord('a'.repeat(61))).toBeNull();
    expect(normalizeDictionaryWord('Bonapriso')).toBe('Bonapriso');
  });
});
