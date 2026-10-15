import { beforeAll, describe, expect, it, jest } from '@jest/globals';
import { EntityManager, In, Repository } from 'typeorm';
import { TenantContext } from 'src/core/tenant/tenant.context';
import {
  RequestUserContext,
  type RequestUserStore,
} from 'src/core/security/request-user.context';
import { UserRole } from 'src/core/enums/user-role.enum';

import { Dossier } from './entities/dossier.entity';
import {
  applyConfidentialityClause,
  DossierVisibilityPatch,
} from './dossier-visibility.patch';

/**
 * Un tableau `where` vide (`[]`) ne porte aucune condition pour TypeORM :
 * s'il traversait le patch tel quel, la règle de confidentialité
 * disparaîtrait et les dossiers confidentiels sortiraient.
 */
const tenantContext = new TenantContext();
const userContext = new RequestUserContext();

const NON_CONFIDENTIAL = { confidentiality_level: false };

/** Avocat ordinaire ; `grantedDossierIds` pré-rempli = cache de la requête. */
function avocat(grantedDossierIds?: number[]): RequestUserStore {
  return { userId: 2, role: UserRole.AVOCAT, permissions: [], grantedDossierIds };
}

function asRequest<T>(user: RequestUserStore, fn: () => T): T {
  return tenantContext.run(1, () => userContext.run(user, fn));
}

describe('applyConfidentialityClause', () => {
  it('traite `[]` comme l’absence de where (sans autorisation)', () => {
    expect(applyConfidentialityClause([], [])).toEqual(NON_CONFIDENTIAL);
    expect(applyConfidentialityClause(undefined, [])).toEqual(NON_CONFIDENTIAL);
  });

  it('traite `[]` comme l’absence de where (avec autorisations)', () => {
    const expected = [NON_CONFIDENTIAL, { id: In([42]) }];
    expect(applyConfidentialityClause([], [42])).toEqual(expected);
    expect(applyConfidentialityClause(undefined, [42])).toEqual(expected);
  });

  it('distribue la règle sur chaque branche d’un where non vide', () => {
    const where = [{ status: 'open' }, { status: 'pending' }];

    expect(applyConfidentialityClause(where, [])).toEqual([
      { status: 'open', ...NON_CONFIDENTIAL },
      { status: 'pending', ...NON_CONFIDENTIAL },
    ]);
    expect(applyConfidentialityClause(where, [42])).toEqual([
      { status: 'open', ...NON_CONFIDENTIAL },
      { status: 'open', id: In([42]) },
      { status: 'pending', ...NON_CONFIDENTIAL },
      { status: 'pending', id: In([42]) },
    ]);
  });
});

describe('DossierVisibilityPatch - where: []', () => {
  beforeAll(() => new DossierVisibilityPatch().onModuleInit());

  function dossierRepository() {
    const manager = {
      connection: {
        getMetadata: () => ({ target: Dossier, tableName: 'dossiers' }),
      },
      find: jest.fn(async (..._args: any[]) => []),
      findAndCount: jest.fn(async (..._args: any[]) => [[], 0]),
      count: jest.fn(async (..._args: any[]) => 0),
      query: jest.fn(async (..._args: any[]) => [{ dossier_id: '42' }]),
    };
    const repository = new Repository<Dossier>(
      Dossier,
      manager as unknown as EntityManager,
    );
    return { repository, manager };
  }

  /** `where` réellement transmis à TypeORM par le dernier appel. */
  const whereSent = (fn: jest.Mock) => (fn.mock.calls.at(-1)?.[1] as any)?.where;

  it('find : un avocat sans autorisation ne voit que le non-confidentiel', async () => {
    const { repository, manager } = dossierRepository();

    await asRequest(avocat([]), () => repository.find({ where: [] }));

    expect(whereSent(manager.find)).toEqual(NON_CONFIDENTIAL);
  });

  it('findAndCount : les autorisations nominatives restent appliquées', async () => {
    const { repository, manager } = dossierRepository();

    await asRequest(avocat(), () => repository.findAndCount({ where: [] }));

    expect(manager.query).toHaveBeenCalledTimes(1);
    expect(whereSent(manager.findAndCount)).toEqual([
      NON_CONFIDENTIAL,
      { id: In([42]) },
    ]);
  });

  it('count : le comptage ne révèle pas les dossiers confidentiels', async () => {
    const { repository, manager } = dossierRepository();

    await asRequest(avocat([]), () => repository.count({ where: [] }));

    expect(whereSent(manager.count)).toEqual(NON_CONFIDENTIAL);
  });

  it("laisse `[]` intact pour l'administration du cabinet", async () => {
    const { repository, manager } = dossierRepository();
    const admin = { userId: 1, role: UserRole.ADMIN, permissions: [] };

    await asRequest(admin, () => repository.find({ where: [] }));

    expect(whereSent(manager.find)).toEqual([]);
  });
});
