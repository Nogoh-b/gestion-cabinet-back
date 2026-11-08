import { describe, expect, it, jest } from '@jest/globals';
import { UserRole } from 'src/core/enums/user-role.enum';
import { In } from 'typeorm';
import { DossiersService } from './dossiers.service';
import { dossierClientScope } from './dossier-role-scope';

/**
 * Listes de dossiers (GET /dossiers, /dossiers/paginated, /dossiers/search) :
 * un tableau `where` est un OU pour TypeORM, chaque branche doit donc porter
 * la portée de l'appelant (client_id du JWT, dossiers dont il est membre) et
 * les filtres — sinon `search` ou `status` ouvrent les dossiers des autres.
 */
type Where = Array<Record<string, unknown>>;
type BuildWhere = (
  searchDto: Record<string, unknown>,
  scope: Record<string, unknown>,
) => Where;

const service = Object.create(DossiersService.prototype) as DossiersService;
const buildWhereWithScope: BuildWhere = (searchDto, scope) =>
  (
    service as unknown as { buildWhereConditions: BuildWhere }
  ).buildWhereConditions(searchDto, scope);
/** Portée « membre » d'un avocat membre des dossiers 12 et 15. */
const memberScope = { id: In([12, 15]) };
const buildWhere = (searchDto: Record<string, unknown>, user: Record<string, unknown>) =>
  buildWhereWithScope(
    searchDto,
    user.role === UserRole.CLIENT
      ? (dossierClientScope(user as never) as Record<string, unknown>)
      : user.role === UserRole.AVOCAT
        ? memberScope
        : {},
  );

/** Dépôt simulé : `dossier_members` renvoie les dossiers 12 et 15. */
const memberDataSource = () => {
  const qb: Record<string, unknown> = {};
  for (const method of ['select', 'where', 'andWhere', 'leftJoin', 'distinct']) {
    qb[method] = () => qb;
  }
  qb.getRawMany = async () => [{ dossierId: '12' }, { dossierId: '15' }];
  return { getRepository: () => ({ createQueryBuilder: () => qb }) };
};

const client = { id: 50, role: UserRole.CLIENT, customerId: 83 };
const avocat = { id: 12, role: UserRole.AVOCAT, customerId: null, tenantId: 1 };
const admin = { id: 1, role: UserRole.ADMIN, customerId: null };

describe('DossiersService - dossiers visibles par un client', () => {
  it('sans filtre, ne retient que les dossiers du client', () => {
    expect(buildWhere({}, client)).toEqual([{ client_id: 83 }]);
  });

  it('une recherche reste limitée aux dossiers du client', () => {
    const where = buildWhere({ search: 'bail' }, client);

    expect(where.length).toBe(3); // object | jurisdiction | dossier_number
    for (const condition of where) {
      expect(condition.client_id).toBe(83);
    }
  });

  it('un filtre statut ou client_id ne sort pas des dossiers du client', () => {
    const where = buildWhere({ status: 'en_cours', client_id: 84 }, client);

    expect(where).toEqual([
      { status: 'en_cours', client: { id: 84 }, client_id: 83 },
    ]);
  });

  it('sans customerId dans le jeton, ne renvoie rien', () => {
    const where = buildWhere({ search: 'bail' }, { ...client, customerId: null });

    expect(where.length).toBeGreaterThan(0);
    for (const condition of where) {
      expect(condition.client_id).toBe(-1);
    }
  });
});

describe('DossiersService - dossiers visibles par un membre du personnel', () => {
  it('sans filtre, ne retient que ses dossiers', () => {
    expect(buildWhere({}, avocat)).toEqual([memberScope]);
  });

  it('un filtre statut reste limité à ses dossiers', () => {
    expect(buildWhere({ status: 'en_cours' }, avocat)).toEqual([
      { status: 'en_cours', ...memberScope },
    ]);
  });

  it('une recherche combinée à un statut garde statut et portée sur chaque branche', () => {
    const where = buildWhere({ search: 'bail', status: 'en_cours' }, avocat);

    expect(where.length).toBe(3);
    for (const condition of where) {
      expect(condition.status).toBe('en_cours');
      expect(condition.id).toEqual(memberScope.id);
    }
  });
});

describe('DossiersService - personnel sans portée de rôle', () => {
  it('sans filtre, aucune condition', () => {
    expect(buildWhere({}, admin)).toEqual([]);
  });

  it('recherche ET statut, pas recherche OU statut', () => {
    const where = buildWhere({ search: 'bail', status: 'en_cours' }, admin);

    expect(where.length).toBe(3);
    for (const condition of where) {
      expect(condition.status).toBe('en_cours');
    }
  });
});

describe('DossiersService - GET /dossiers/search', () => {
  const searchAs = async (
    criteria: Record<string, unknown>,
    user: Record<string, unknown>,
  ) => {
    const paginateWithTransformer = jest.fn(async () => ({
      data: [],
      meta: {},
    }));
    const svc = Object.create(DossiersService.prototype) as DossiersService;
    Object.assign(svc as object, {
      repository: { metadata: { hasColumnWithPropertyPath: () => true, relations: [], embeddeds: [] } },
      paginationService: { paginateWithTransformer },
      dataSource: memberDataSource(),
    });
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);

    await svc.searchForUser(criteria, undefined, user as never);

    logSpy.mockRestore();
    const where = (paginateWithTransformer.mock.calls[0] as unknown[])[3];
    return (Array.isArray(where) ? where : [where]) as Where;
  };

  it('un client ne voit que ses dossiers, même avec search et client_id', async () => {
    const where = await searchAs({ search: 'bail', client_id: 84 }, client);

    expect(where.length).toBeGreaterThan(1);
    for (const condition of where) {
      expect(condition.client_id).toBe(83);
    }
  });

  it('un client sans recherche ne voit que ses dossiers', async () => {
    expect(await searchAs({}, client)).toEqual([{ client_id: 83 }]);
  });

  it('le personnel ne trouve que les dossiers dont il est membre', async () => {
    const getCurrentTenantId = jest.spyOn(
      await import('src/core/tenant/tenant.context'),
      'getCurrentTenantId',
    );
    getCurrentTenantId.mockReturnValue(1);
    const where = await searchAs({ search: 'bail' }, avocat);
    getCurrentTenantId.mockRestore();

    expect(where.length).toBeGreaterThan(0);
    for (const condition of where) {
      expect(condition.id).toEqual(In([12, 15]));
    }
  });

  it("l'admin et « Voir tous les dossiers » cherchent dans tout le cabinet", async () => {
    for (const user of [admin, { id: 30, role: 'secretaire', permissions: ['view_all_dossiers'] }]) {
      const where = await searchAs({ search: 'bail' }, user);
      for (const condition of where) {
        expect(condition).not.toHaveProperty('id');
        expect(condition).not.toHaveProperty('client_id');
      }
    }
  });
});
