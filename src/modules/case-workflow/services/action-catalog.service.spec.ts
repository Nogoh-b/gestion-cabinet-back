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
  ruleRepository: any = {},
) =>
  new ActionCatalogService(
    familyRepository,
    definitionRepository,
    ruleRepository,
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

/**
 * Les index UNIQUE du catalogue (`UQ_case_action_family_tenant_code`,
 * `UQ_case_action_definition_version`, `UQ_case_recommendation_rule_version`)
 * n'incluent pas `deleted_at` : une ligne soft-deleted occupe donc toujours son
 * code, alors que les recherches TypeORM l'excluent par défaut. Ces tests
 * couvrent le scénario qui produisait
 * « Duplicate entry '1-FORMALITES' for key 'UQ_case_action_family_tenant_code' »
 * — typiquement après le nettoyage d'un plan d'écriture IA échoué.
 */
describe('ActionCatalogService - codes réservés par des lignes soft-deleted', () => {
  it('restaure une famille supprimée logiquement au lieu d’échouer', async () => {
    const familyRepository = {
      findOne: jest.fn(async () => ({
        id: 'family-1',
        code: 'FORMALITES',
        label: 'Formalités',
        deleted_at: new Date(),
      })),
      create: jest.fn((value: any) => value),
      save: jest.fn(async (value: any) => value),
    };

    const family: any = await buildService(familyRepository).createFamily({
      code: 'formalites',
      label: 'Formalités administratives',
    } as any);

    expect(family.deleted_at).toBeNull();
    expect(family.label).toBe('Formalités administratives');
    expect(familyRepository.save).toHaveBeenCalledTimes(1);
  });

  it('ne laisse pas remonter l’ER_DUP_ENTRY brut quand la collision est invisible', async () => {
    const softDeleted = {
      id: 'family-1',
      code: 'FORMALITES',
      deleted_at: new Date(),
    };
    let withDeletedLookups = 0;
    const familyRepository = {
      findOne: jest.fn(async (options?: any) => {
        // La pré-vérification ne voit rien ; la ligne n'apparaît qu'après
        // l'échec du save, comme lors d'un rejeu de plan.
        if (!options?.withDeleted) return null;
        withDeletedLookups += 1;
        return withDeletedLookups === 1 ? null : { ...softDeleted };
      }),
      create: jest.fn((value: any) => value),
      save: jest
        .fn<any>()
        .mockRejectedValueOnce(duplicateKeyError())
        .mockImplementation(async (value: any) => value),
    };

    const family: any = await buildService(familyRepository).createFamily({
      code: 'FORMALITES',
      label: 'Formalités',
    } as any);

    expect(family.deleted_at).toBeNull();
    expect(familyRepository.save).toHaveBeenCalledTimes(2);
  });

  it('restaure une définition v1 supprimée logiquement', async () => {
    const familyRepository = {
      findOne: jest.fn(async () => ({ id: 'family-1' })),
    };
    const definitionRepository = {
      findOne: jest.fn(async () => ({
        id: 'definition-1',
        code: 'COMPLETE_FORMALITY',
        version: 1,
        deleted_at: new Date(),
      })),
      create: jest.fn((value: any) => value),
      save: jest.fn(async (value: any) => value),
    };

    const definition: any = await buildService(
      familyRepository,
      definitionRepository,
    ).createDefinition({
      family_id: 'family-1',
      code: 'COMPLETE_FORMALITY',
      label: 'Effectuer une formalité',
    } as any);

    expect(definition.deleted_at).toBeNull();
    expect(definition.version).toBe(1);
    expect(definitionRepository.save).toHaveBeenCalledTimes(1);
  });

  it('restaure une règle de recommandation supprimée logiquement', async () => {
    const ruleRepository = {
      findOne: jest.fn(async () => ({
        id: 'rule-1',
        code: 'DRAFT_TO_REVIEW',
        version: 1,
        deleted_at: new Date(),
      })),
      create: jest.fn((value: any) => value),
      save: jest.fn(async (value: any) => value),
    };
    const definitionRepository = {
      findOne: jest.fn(async () => ({ id: 'definition-1' })),
    };

    const rule: any = await buildService(
      { findOne: jest.fn(async () => ({ id: 'family-1' })) },
      definitionRepository,
      ruleRepository,
    ).createRecommendationRule({
      code: 'DRAFT_TO_REVIEW',
      label: 'Projet à relire',
      trigger: 'DOCUMENT_STATUS_CHANGED',
      condition_json: { '==': [{ var: 'documents.pendingReview' }, true] },
      action_definition_id: 'definition-1',
      reason_template: 'Un projet de document attend une relecture.',
    } as any);

    expect(rule.deleted_at).toBeNull();
    expect(rule.label).toBe('Projet à relire');
  });

  it('écarte les codes tenus par des lignes supprimées lors de la génération', async () => {
    let withDeletedLookups = 0;
    const findOne = jest.fn(async (options?: any) => {
      if (!options?.withDeleted) return null;
      withDeletedLookups += 1;
      // Premier code proposé réservé par une ligne soft-deleted, suivant libre.
      return withDeletedLookups === 1
        ? { id: 'family-1', deleted_at: new Date() }
        : null;
    });
    const familyRepository = {
      findOne,
      create: jest.fn((value: any) => value),
      save: jest.fn(async (value: any) => value),
    };

    await buildService(familyRepository).createFamily({
      label: 'Formalités',
    } as any);

    // La génération a bien interrogé la table en incluant les supprimées,
    // sinon l'index UNIQUE aurait rejeté le code proposé.
    expect(
      findOne.mock.calls.filter(
        ([options]: any[]) => options?.withDeleted === true,
      ).length,
    ).toBeGreaterThanOrEqual(2);
    expect(familyRepository.save).toHaveBeenCalledTimes(1);
  });
});

