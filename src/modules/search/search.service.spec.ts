import { GlobalSearchService } from './search.service';
import { GlobalSearchDto, SearchUser } from './search.dto';
import { Dossier } from '../dossiers/entities/dossier.entity';
import { Customer } from '../customer/customer/entities/customer.entity';
import { DocumentCustomer } from '../documents/document-customer/entities/document-customer.entity';
import { Audience } from '../audiences/entities/audience.entity';
import { Facture } from '../facture/entities/facture.entity';
import { RequestUserContext } from 'src/core/security/request-user.context';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

describe('GlobalSearchService', () => {
  let service: GlobalSearchService;
  let db: any;
  let builders: any[];
  const user: SearchUser = {
    tenantId: 8,
    role: 'avocat',
    permissions: [
      'view_dossiers',
      'view_clients',
      'view_documents',
      'view_audiences',
      'view_factures',
    ],
  };
  const context = {
    dossierId: 42,
    dossierNumber: 'DOS-2026-042',
    dossierObject: 'Contrat commercial',
    clientName: 'Acme',
  };

  beforeEach(() => {
    builders = [];
    const rows = new Map<any, any[]>([
      [Dossier, [{ id: 42, title: 'DOS-2026-042', ...context }]],
      [Customer, [{ id: 12, title: 'Acme' }]],
      [DocumentCustomer, [{ id: 7, title: 'Contrat.pdf', ...context }]],
      [Audience, [{ id: 3, title: 'Plaidoirie', ...context }]],
      [Facture, [{ id: 'uuid-facture', title: 'FAC-2026-1', ...context }]],
    ]);
    db = {
      getRepository: jest.fn((entity) => ({
        createQueryBuilder: jest.fn((alias) => {
          const qb: any = { entity, alias };
          [
            'select',
            'addSelect',
            'where',
            'andWhere',
            'leftJoin',
            'innerJoin',
            'orderBy',
            'addOrderBy',
            'offset',
            'limit',
            'clone',
          ].forEach((method) => {
            qb[method] = jest.fn(() => qb);
          });
          qb.getRawMany = jest.fn().mockResolvedValue(
            alias === 'd'
              ? [
                  { clientId: 12, ...context },
                  {
                    clientId: 12,
                    ...context,
                    dossierId: 43,
                    dossierNumber: 'DOS-2026-043',
                  },
                ]
              : rows.get(entity),
          );
          qb.getCount = jest.fn().mockResolvedValue(12);
          builders.push(qb);
          return qb;
        }),
      })),
    };
    service = new GlobalSearchService(db);
  });

  it('retourne les vraies destinations et le contexte dossier pour chaque catégorie liée', async () => {
    const response = await service.search({ q: 'contrat', page: 1 }, user);
    expect(response.results.map((row) => row.href)).toEqual([
      '/dossiers/42',
      '/clients/12',
      '/documents/7',
      '/audiences/3',
      '/facturation/factures/uuid-facture',
    ]);
    for (const result of response.results) {
      expect(result.dossiers[0]).toEqual({
        id: 42,
        number: 'DOS-2026-042',
        object: 'Contrat commercial',
        client: 'Acme',
      });
    }
    expect(response.results[1].dossiers).toHaveLength(2);
    expect(response.counts.all).toBe(60);
    expect(response.hasNext).toBe(true);
  });

  it('ne consulte aucune catégorie sans permission ou pour une recherche vide', async () => {
    expect(
      (
        await service.search(
          { q: 'contrat', page: 1 },
          { ...user, permissions: [] },
        )
      ).results,
    ).toEqual([]);
    expect((await service.search({ q: '   ', page: 1 }, user)).counts.all).toBe(
      0,
    );
    expect(db.getRepository).not.toHaveBeenCalled();
  });

  it('applique le cabinet, les dossiers confidentiels et la pagination avant de compter', async () => {
    await new RequestUserContext().run(
      { userId: 9, role: 'avocat', permissions: user.permissions },
      () => service.search({ q: 'contrat', page: 2 }, user),
    );
    for (const qb of builders) {
      expect(qb.where).toHaveBeenCalledWith(
        expect.stringContaining('tenant_id = :tenantId'),
        { tenantId: 8 },
      );
      if (qb.entity !== Customer) {
        expect(qb.andWhere).toHaveBeenCalledWith(
          expect.stringContaining('confidentiality_level = false'),
          { __visibilityUserId: 9 },
        );
      }
      if (qb.alias === 'r') {
        expect(qb.offset).toHaveBeenCalledWith(10);
        expect(qb.limit).toHaveBeenCalledWith(10);
      }
    }
  });

  it('écarte les documents liés si le droit de voir les dossiers manque', async () => {
    await service.search(
      { q: '%_!', page: 1 },
      { ...user, permissions: ['view_documents'] },
    );
    expect(builders).toHaveLength(1);
    expect(builders[0].andWhere).toHaveBeenCalledWith('r.dossier_id IS NULL');
    const bracket = builders[0].andWhere.mock.calls.find(
      ([value]) => value?.whereFactory,
    )?.[0];
    const where = { where: jest.fn(), orWhere: jest.fn() };
    bracket.whereFactory(where);
    expect(where.where).toHaveBeenCalledWith(
      expect.stringContaining("ESCAPE '!'"),
      { term: '%!%!_!!%' },
    );
  });

  it('valide les paramètres et refuse les pages et requêtes excessives', async () => {
    expect(
      await validate(
        plainToInstance(GlobalSearchDto, { q: ' contrat ', page: '2' }),
      ),
    ).toHaveLength(0);
    expect(plainToInstance(GlobalSearchDto, { q: ' contrat ' }).q).toBe(
      'contrat',
    );
    for (const input of [
      { page: '0' },
      { page: '1.2' },
      { page: '10001' },
      { q: 'a'.repeat(201) },
    ]) {
      expect(
        (await validate(plainToInstance(GlobalSearchDto, input))).length,
      ).toBeGreaterThan(0);
    }
  });
});
