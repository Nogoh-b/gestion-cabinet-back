import { describe, expect, it, jest } from '@jest/globals';
import { ConflictException } from '@nestjs/common';
import { ActionCatalogService } from './action-catalog.service';

/** Forme d'un code auto-généré : slug du libellé + suffixe aléatoire. */
const GENERATED_CODE = /^[A-Z0-9_]+_[A-Z0-9]{4}$/;

const duplicateKeyError = () =>
  Object.assign(new Error('duplicate'), { code: 'ER_DUP_ENTRY' });

const buildService = (
  familyRepository: any = {},
  definitionRepository: any = {},
) =>
  new ActionCatalogService(
    familyRepository,
    definitionRepository,
    {} as any,
    {} as any,
  );

describe('ActionCatalogService - génération du code de famille', () => {
  it('génère un code à partir du libellé quand aucun code n’est fourni', async () => {
    const familyRepository = {
      findOne: jest.fn(async () => null as any),
      create: jest.fn((value: any) => value),
      save: jest.fn(async (value: any) => value),
    };

    const created: any = await buildService(familyRepository).createFamily({
      label: 'Contentieux commercial',
    } as any);

    expect(created.code).toMatch(GENERATED_CODE);
    expect(created.code).toContain('CONTENTIEU');
    expect(familyRepository.save).toHaveBeenCalledTimes(1);
  });

  it('réessaie une seule fois si le code auto-généré est déjà pris en base', async () => {
    const familyRepository = {
      findOne: jest.fn(async () => null as any),
      create: jest.fn((value: any) => value),
      save: jest
        .fn<any>()
        .mockRejectedValueOnce(duplicateKeyError())
        .mockImplementation(async (value: any) => value),
    };

    const created: any = await buildService(familyRepository).createFamily({
      label: 'Formalités',
    } as any);

    expect(created.code).toMatch(GENERATED_CODE);
    expect(familyRepository.save).toHaveBeenCalledTimes(2);
  });

  it('remonte toujours le conflit quand le code vient de l’utilisateur', async () => {
    const familyRepository = {
      findOne: jest.fn(async () => ({ id: 'family-1', code: 'FORMALITES' })),
    };

    await expect(
      buildService(familyRepository).createFamily({
        code: 'FORMALITES',
        label: 'Formalités',
      } as any),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('normalise un code fourni par l’utilisateur', async () => {
    const familyRepository = {
      findOne: jest.fn(async () => null as any),
      create: jest.fn((value: any) => value),
      save: jest.fn(async (value: any) => value),
    };

    const created: any = await buildService(familyRepository).createFamily({
      code: ' formalités-diverses ',
      label: 'Formalités',
    } as any);

    expect(created.code).toBe('FORMALIT_S_DIVERSES');
  });
});

describe('ActionCatalogService - génération du code de définition', () => {
  const familyRepository = {
    findOne: jest.fn(async () => ({ id: 'family-1' })),
  };

  it('génère un code à partir du libellé quand aucun code n’est fourni', async () => {
    const definitionRepository = {
      findOne: jest.fn(async () => null as any),
      create: jest.fn((value: any) => value),
      save: jest.fn(async (value: any) => value),
    };

    const created: any = await buildService(
      familyRepository,
      definitionRepository,
    ).createDefinition({
      family_id: 'family-1',
      label: 'Faire signer le document',
    } as any);

    expect(created.code).toMatch(GENERATED_CODE);
    expect(created.version).toBe(1);
    expect(created.is_active).toBe(true);
  });

  it('réessaie une seule fois sur collision du code auto-généré', async () => {
    const definitionRepository = {
      findOne: jest.fn(async () => null as any),
      create: jest.fn((value: any) => value),
      save: jest
        .fn<any>()
        .mockRejectedValueOnce(duplicateKeyError())
        .mockImplementation(async (value: any) => value),
    };

    const created: any = await buildService(
      familyRepository,
      definitionRepository,
    ).createDefinition({
      family_id: 'family-1',
      label: 'Plaider',
    } as any);

    expect(created.code).toMatch(GENERATED_CODE);
    expect(definitionRepository.save).toHaveBeenCalledTimes(2);
  });

  it('invite à créer une version quand le code fourni existe déjà', async () => {
    const definitionRepository = {
      findOne: jest.fn(async () => ({ id: 'definition-1' })),
    };

    await expect(
      buildService(familyRepository, definitionRepository).createDefinition({
        family_id: 'family-1',
        code: 'SIGN_DOCUMENT',
        label: 'Faire signer le document',
      } as any),
    ).rejects.toThrow(/créez une nouvelle version/);
  });
});
