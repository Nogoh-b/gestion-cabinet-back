import { UserRole } from 'src/core/enums/user-role.enum';
import { AudienceStatus } from '../audiences/entities/audience.entity';
import { SidebarCountsCache } from './sidebar-counts.cache';
import {
  audienceInProgressStatus,
  SIDEBAR_COUNTS_TTL_SECONDS,
  SidebarCountsService,
  SidebarCountsUser,
} from './sidebar-counts.service';

/** QueryBuilder factice : mémorise les clauses et renvoie un nombre fixe. */
function fakeRepo(count: number) {
  const clauses: string[] = [];
  const params: Record<string, unknown> = {};
  const qb: any = {
    expressionMap: { mainAlias: { metadata: { target: class {} } } },
    where: (sql: string, p?: object) => (clauses.push(sql), Object.assign(params, p), qb),
    andWhere: (sql: string, p?: object) => (clauses.push(sql), Object.assign(params, p), qb),
    getCount: jest.fn().mockResolvedValue(count),
  };
  return { repo: { createQueryBuilder: jest.fn(() => qb) } as any, qb, clauses, params };
}

function build(options: { enabled?: boolean; cached?: any } = {}) {
  const dossiers = fakeRepo(3);
  const audiences = fakeRepo(2);
  const factures = fakeRepo(5);
  const documents = fakeRepo(7);
  const db = {
    query: jest.fn().mockResolvedValue([{ enabled: options.enabled === false ? 0 : 1 }]),
  } as any;
  const cache = {
    get: jest.fn().mockResolvedValue(options.cached ?? null),
    set: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<SidebarCountsCache>;
  const service = new SidebarCountsService(
    dossiers.repo,
    audiences.repo,
    factures.repo,
    documents.repo,
    db,
    cache,
  );
  return { service, dossiers, audiences, factures, documents, db, cache };
}

const admin: SidebarCountsUser = { id: 1, userId: 1, role: UserRole.ADMIN, permissions: [] };

describe('SidebarCountsService', () => {
  it('renvoie des compteurs vides, sans requête ni cache, quand les badges sont désactivés', async () => {
    const t = build({ enabled: false });
    const result = await t.service.getCounts(admin, 4);
    expect(result).toEqual({
      enabled: false,
      dossiersUrgents: 0,
      audiencesDuJour: 0,
      audiencesEnCours: 0,
      facturesImpayees: 0,
      documentsEnAttente: 0,
    });
    expect(t.dossiers.repo.createQueryBuilder).not.toHaveBeenCalled();
    expect(t.cache.get).not.toHaveBeenCalled();
    expect(t.cache.set).not.toHaveBeenCalled();
  });

  it('calcule les compteurs puis les met en cache 60 s par cabinet et utilisateur', async () => {
    const t = build();
    const result = await t.service.getCounts(admin, 4);
    expect(result).toMatchObject({
      enabled: true,
      dossiersUrgents: 3,
      audiencesDuJour: 2,
      facturesImpayees: 5,
      documentsEnAttente: 7,
    });
    expect(t.cache.set).toHaveBeenCalledWith(
      'sidebar-counts:4:1',
      expect.objectContaining({ dossiersUrgents: 3 }),
      SIDEBAR_COUNTS_TTL_SECONDS,
    );
    expect(SIDEBAR_COUNTS_TTL_SECONDS).toBe(60);
  });

  it('sert le cache sans toucher à la base', async () => {
    const t = build({
      cached: {
        dossiersUrgents: 9,
        audiencesDuJour: 0,
        audiencesEnCours: 0,
        facturesImpayees: 0,
        documentsEnAttente: 0,
      },
    });
    const result = await t.service.getCounts(admin, 4);
    expect(result.enabled).toBe(true);
    expect(result.dossiersUrgents).toBe(9);
    expect(t.dossiers.repo.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('ne compte que ce que les droits autorisent', async () => {
    const t = build();
    const user: SidebarCountsUser = {
      id: 8,
      userId: 8,
      role: 'secretaire',
      permissions: ['view_documents', 'view_audiences'],
    };
    const result = await t.service.getCounts(user, 4);
    expect(result.documentsEnAttente).toBe(7);
    expect(result.audiencesDuJour).toBe(2);
    expect(result.dossiersUrgents).toBe(0);
    expect(result.facturesImpayees).toBe(0);
    expect(t.factures.repo.createQueryBuilder).not.toHaveBeenCalled();
    expect(t.dossiers.repo.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('ne donne aucun compteur au portail client', async () => {
    const t = build();
    const result = await t.service.getCounts(
      { id: 9, userId: 9, role: UserRole.CLIENT, permissions: ['view_dossiers'] },
      4,
    );
    expect(result).toMatchObject({ enabled: true, dossiersUrgents: 0, documentsEnAttente: 0 });
  });

  it("limite un avocat à ses dossiers (dossierRoleScope)", async () => {
    const t = build();
    const lawyer: SidebarCountsUser = {
      id: 12,
      userId: 12,
      role: 'avocat',
      base_role: 'avocat',
      permissions: ['view_dossiers', 'view_audiences', 'view_factures', 'view_documents'],
    };
    await t.service.getCounts(lawyer, 4);
    expect(t.dossiers.clauses).toContain('dossier.lawyer_id = :__scopeLawyerId');
    expect(t.dossiers.params.__scopeLawyerId).toBe(12);
    for (const [alias, fake] of [
      ['audience', t.audiences],
      ['facture', t.factures],
      ['document', t.documents],
    ] as const) {
      expect(fake.clauses.some((c) => c.includes(`${alias}.dossier_id IN (SELECT dl.id`))).toBe(true);
      expect(fake.params.__scopeLawyerId).toBe(12);
    }
  });

  it("n'applique pas la portée avocat à l'administration", async () => {
    const t = build();
    await t.service.getCounts(admin, 4);
    expect(t.dossiers.clauses).not.toContain('dossier.lawyer_id = :__scopeLawyerId');
    expect(t.factures.clauses.some((c) => c.includes('dl.lawyer_id'))).toBe(false);
  });

  it("passe les colonnes ENUM en chaînes (un nombre serait lu comme un index d'énumération)", async () => {
    const t = build();
    await t.service.getCounts(admin, 4);
    expect(t.dossiers.params.highLevels).toEqual(['2', '3']);
    expect(t.factures.params).toMatchObject({ status: '3', brouillon: '0', cancelled: '5' });
    expect(t.documents.params.status).toBe('0');
    expect((t.audiences.params.statuses as unknown[]).every((v) => typeof v === 'string')).toBe(true);
  });

  it('un compteur en panne reste à 0 sans casser les autres', async () => {
    const t = build();
    t.factures.qb.getCount.mockRejectedValue(new Error('boom'));
    const result = await t.service.getCounts(admin, 4);
    expect(result.facturesImpayees).toBe(0);
    expect(result.dossiersUrgents).toBe(3);
  });

  describe('audiences en cours', () => {
    const hasStatus = 'IN_PROGRESS' in AudienceStatus;

    it('ne compte le statut IN_PROGRESS que s’il existe dans AudienceStatus', async () => {
      const t = build();
      const result = await t.service.getCounts(admin, 4);
      if (hasStatus) {
        expect(audienceInProgressStatus()).toBe(4);
        expect(result.audiencesEnCours).toBe(2);
        expect(t.audiences.params.status).toBe('4');
      } else {
        expect(audienceInProgressStatus()).toBeNull();
        expect(result.audiencesEnCours).toBe(0);
        expect(t.audiences.repo.createQueryBuilder).toHaveBeenCalledTimes(1);
      }
    });
  });
});
