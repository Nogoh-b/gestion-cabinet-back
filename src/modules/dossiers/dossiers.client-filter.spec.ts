import { describe, expect, it, jest } from '@jest/globals';
import { UserRole } from 'src/core/enums/user-role.enum';
import { DossiersService } from './dossiers.service';

/**
 * Listes de dossiers (GET /dossiers, /dossiers/paginated, /dossiers/search) :
 * un tableau `where` est un OU pour TypeORM, chaque branche doit donc porter
 * la portée du rôle (client_id du JWT, avocat référent) et les filtres —
 * sinon `search` ou `status` ouvrent les dossiers des autres.
 */
type Where = Array<Record<string, unknown>>;
type BuildWhere = (
  searchDto: Record<string, unknown>,
  user: Record<string, unknown>,
) => Where;

const service = Object.create(DossiersService.prototype) as DossiersService;
const buildWhere: BuildWhere = (searchDto, user) =>
  (
    service as unknown as { buildWhereConditions: BuildWhere }
  ).buildWhereConditions(searchDto, user);

const client = { id: 50, role: UserRole.CLIENT, customerId: 83 };
const avocat = { id: 12, role: UserRole.AVOCAT, customerId: null };
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

describe('DossiersService - dossiers visibles par un avocat', () => {
  it('sans filtre, ne retient que ses dossiers', () => {
    expect(buildWhere({}, avocat)).toEqual([{ lawyer: { id: 12 } }]);
  });

  it('un filtre statut reste limité à ses dossiers', () => {
    expect(buildWhere({ status: 'en_cours' }, avocat)).toEqual([
      { status: 'en_cours', lawyer: { id: 12 } },
    ]);
  });

  it('une recherche combinée à un statut garde statut et avocat sur chaque branche', () => {
    const where = buildWhere({ search: 'bail', status: 'en_cours' }, avocat);

    expect(where.length).toBe(3);
    for (const condition of where) {
      expect(condition.status).toBe('en_cours');
      expect(condition.lawyer).toEqual({ id: 12 });
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
      repository: {},
      paginationService: { paginateWithTransformer },
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

  it('le personnel garde la recherche sur tout le cabinet', async () => {
    const where = await searchAs({ search: 'bail' }, avocat);

    for (const condition of where) {
      expect(condition).not.toHaveProperty('client_id');
      expect(condition).not.toHaveProperty('lawyer.id');
    }
  });
});

describe('DossiersService - avocat chargé dans les listes', () => {
  it('GET /dossiers charge lawyer.user (full_name de l’avocat)', async () => {
    const find = jest.fn(async () => []);
    const svc = Object.create(DossiersService.prototype) as DossiersService;
    Object.assign(svc as object, { dossierRepository: { find } });

    await svc.findAll({} as never, client as never);

    const options = (find.mock.calls[0] as unknown[])[0] as {
      relations: string[];
    };
    expect(options.relations).toContain('lawyer.user');
  });

  it('GET /dossiers/paginated charge lawyer.user et ne passe jamais where: []', async () => {
    const paginateWithTransformer = jest.fn(async () => ({
      data: [],
      meta: {},
    }));
    const svc = Object.create(DossiersService.prototype) as DossiersService;
    Object.assign(svc as object, {
      dossierRepository: {},
      paginationService: { paginateWithTransformer },
    });

    await svc.findAllPaginated({} as never, {} as never, admin as never);

    const args = paginateWithTransformer.mock.calls[0] as unknown[];
    expect(args[3]).toBeUndefined();
    expect(args[4]).toContain('lawyer.user');
    expect(args[4]).not.toContain('lawyer.employee');
  });
});
