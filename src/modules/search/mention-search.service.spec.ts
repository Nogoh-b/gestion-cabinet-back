import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  TenantContext,
  getCurrentTenantId,
} from 'src/core/tenant/tenant.context';
import {
  RequestUserContext,
  getCurrentRequestUser,
} from 'src/core/security/request-user.context';
import { MentionSearchService } from './mention-search.service';
import { MentionSearchDto, SearchUser } from './search.dto';

describe('MentionSearchService', () => {
  const ALL = [
    'view_clients',
    'view_dossiers',
    'view_user_directory',
    'view_audiences',
    'view_factures',
    'view_documents',
    'view_suppliers',
    'view_referrers',
  ];
  const user: SearchUser = { tenantId: 8, role: 'avocat', permissions: ALL };

  let services: Record<string, Record<string, jest.Mock>>;
  /** Cabinet et appelant vus par chaque recherche au moment de l'appel. */
  let seen: Array<{ type: string; tenantId: number; userId?: number }>;
  let service: MentionSearchService;
  /** Modèles : listés en entier par leur module, filtrés par la recherche @. */
  let templates: Record<string, { findAll: jest.Mock }>;

  const page = (rows: any[], total = rows.length) => ({
    data: rows,
    meta: { page: 1, limit: 3, total },
  });
  const searchMock = (type: string, rows: any[], total?: number) =>
    jest.fn(async () => {
      seen.push({
        type,
        tenantId: getCurrentTenantId(),
        userId: getCurrentRequestUser()?.userId,
      });
      return page(rows, total);
    });

  beforeEach(() => {
    seen = [];
    services = {
      customers: {
        searchWithTransformer: searchMock(
          'client',
          [
            {
              id: 7,
              tenant_id: 8,
              full_name: 'Dupont SARL',
              email: 'contact@dupont.cm',
            },
          ],
          12,
        ),
      },
      dossiers: {
        searchForUser: searchMock('dossier', [
          {
            id: 42,
            tenant_id: 8,
            dossier_number: 'DOS-2026-042',
            object: 'Contrat commercial',
            client: { full_name: 'Dupont SARL' },
          },
        ]),
      },
      employees: {
        searchDirectory: searchMock('employee', [
          {
            id: 3,
            full_name: 'Awa Dossou',
            position: 'Avocate',
            email: 'awa@cabinet.cm',
          },
        ]),
      },
      diligences: {
        searchWithTransformer: searchMock('diligence', [
          { id: 5, tenant_id: 8, title: 'Dossier de plaidoirie' },
        ]),
      },
      audiences: {
        searchWithTransformer: searchMock('audience', [
          {
            id: 9,
            tenant_id: 8,
            audience_type: { name: 'Plaidoirie' },
            audience_date: new Date('2026-10-20T00:00:00.000Z'),
          },
        ]),
      },
      factures: {
        searchWithTransformer: searchMock('facture', [
          { id: 'uuid-1', tenant_id: 8, numero: 'FAC-2026-DO1' },
        ]),
      },
      documents: {
        searchWithTransformer: searchMock('document', [
          { id: 11, tenant_id: 8, name: 'Dossier complet.pdf' },
        ]),
      },
      suppliers: {
        searchWithTransformer: searchMock('fournisseur', [
          { id: 2, tenant_id: 8, company_name: 'Dorade Fournitures' },
        ]),
      },
      referrers: {
        searchWithTransformer: searchMock('apporteur', [
          { id: 4, tenant_id: 8, company_name: '', contact_name: 'Do Mbarga' },
        ]),
      },
    };
    templates = {
      pdf: {
        findAll: jest.fn(async () => [
          { id: 1, tenant_id: 1, code: 'facture_client', name: 'Facture client', entity_type: 'facture' },
          { id: 2, tenant_id: 8, code: 'attestation_dossier', name: 'Attestation de dossier', entity_type: 'dossier' },
        ]),
      },
      mail: {
        findAll: jest.fn(async () => [
          { id: 3, tenant_id: 1, code: 'avis_audience', name: 'Avis d’audience', subject: 'Votre prochaine audience' },
        ]),
      },
    };
    const s = services as any;
    service = new MentionSearchService(
      s.customers,
      s.dossiers,
      s.employees,
      s.diligences,
      s.audiences,
      s.factures,
      s.documents,
      s.suppliers,
      s.referrers,
      templates.pdf as any,
      templates.mail as any,
    );
  });

  it('cherche les modèles de documents et de mails, globaux compris', async () => {
    const withTemplates = {
      ...user,
      permissions: ['view_pdf_templates', 'view_mail_templates'],
    };
    const groups = await service.search({ q: 'Attéstation', limit: 3 }, withTemplates);
    expect(groups.find((group) => group.type === 'modele_document')).toEqual({
      type: 'modele_document',
      items: [
        {
          id: 2,
          label: 'Attestation de dossier',
          sublabel: 'Document · pour les dossiers',
          data: { numero: 'attestation_dossier' },
        },
      ],
      hasMore: false,
    });

    const mails = await service.search({ q: 'audience', limit: 3 }, withTemplates);
    // Modèle global (tenant 1) : visible de chaque cabinet.
    expect(mails.find((group) => group.type === 'modele_mail')?.items[0]).toMatchObject({
      id: 3,
      label: 'Avis d’audience',
      sublabel: 'Votre prochaine audience',
    });
    expect(
      (await service.search({ q: 'facture', limit: 3 }, user)).map((group) => group.type),
    ).not.toContain('modele_document');
  });

  const allMocks = () =>
    Object.values(services).flatMap((methods) => Object.values(methods));

  it('cherche chaque catégorie une fois et reprend les libellés du menu @', async () => {
    const groups = await service.search({ q: ' do ', limit: 3 }, user);

    expect(groups.map((group) => group.type)).toEqual([
      'client',
      'dossier',
      'employee',
      'diligence',
      'audience',
      'facture',
      'document',
      'fournisseur',
      'apporteur',
    ]);
    const byType = Object.fromEntries(
      groups.map((group) => [group.type, group]),
    );
    expect(byType.client).toEqual({
      type: 'client',
      items: [
        {
          id: 7,
          label: 'Dupont SARL',
          sublabel: 'contact@dupont.cm',
          data: { email: 'contact@dupont.cm' },
        },
      ],
      hasMore: true,
    });
    expect(byType.dossier.items[0]).toMatchObject({
      id: 42,
      label: '#DOS-2026-042 — Contrat commercial',
      sublabel: 'Dupont SARL',
      data: { numero: 'DOS-2026-042' },
    });
    expect(byType.dossier.hasMore).toBe(false);
    expect(byType.employee.items[0]).toMatchObject({
      label: 'Awa Dossou',
      sublabel: 'Avocate',
    });
    expect(byType.diligence.items[0]).toMatchObject({
      label: 'Dossier de plaidoirie',
      sublabel: undefined,
    });
    expect(byType.audience.items[0].label).toBe('Plaidoirie — 20/10/2026');
    expect(byType.facture.items[0]).toMatchObject({
      id: 'uuid-1',
      label: 'FAC-2026-DO1',
    });
    expect(byType.document.items[0].label).toBe('Dossier complet.pdf');
    expect(byType.fournisseur.items[0].label).toBe('Dorade Fournitures');
    expect(byType.apporteur.items[0].label).toBe('Do Mbarga');

    // Même appel que les routes GET /<module>/search, sans tri imposé.
    for (const mock of allMocks()) {
      expect(mock).toHaveBeenCalledTimes(1);
      expect(mock.mock.calls[0]).toEqual(
        expect.arrayContaining([{ search: 'do' }, { page: 1, limit: 3 }]),
      );
    }
    expect(services.dossiers.searchForUser).toHaveBeenCalledWith(
      { search: 'do' },
      { page: 1, limit: 3 },
      user,
    );
  });

  it('ne cherche pas une catégorie sans son droit (pas de 403, pas de groupe)', async () => {
    const groups = await service.search(
      { q: 'do', limit: 3 },
      { ...user, permissions: ALL.filter((code) => code !== 'view_factures') },
    );
    expect(groups.map((group) => group.type)).not.toContain('facture');
    expect(services.factures.searchWithTransformer).not.toHaveBeenCalled();
    expect(groups).toHaveLength(8);
  });

  it('sans aucun droit : seules les diligences (route sans permission)', async () => {
    const groups = await service.search(
      { q: 'do', limit: 3 },
      { ...user, permissions: [] },
    );
    expect(groups.map((group) => group.type)).toEqual(['diligence']);
    expect(seen.map((call) => call.type)).toEqual(['diligence']);
  });

  it("l'administrateur et SUPER_ADMIN voient toutes les catégories", async () => {
    // « do » : un modèle de document (« Attestation de dossier »), aucun mail.
    expect(
      await service.search(
        { q: 'do', limit: 3 },
        { ...user, role: 'admin', permissions: [] },
      ),
    ).toHaveLength(10);
    expect(
      await service.search(
        { q: 'do', limit: 3 },
        { ...user, permissions: ['SUPER_ADMIN'] },
      ),
    ).toHaveLength(10);
  });

  it("reste dans le cabinet et l'appelant de chaque requête, même en parallèle", async () => {
    const tenants = new TenantContext();
    const users = new RequestUserContext();
    const run = (tenantId: number, userId: number) =>
      tenants.run(tenantId, () =>
        users.run({ userId, role: 'avocat', permissions: ALL }, () =>
          service.search({ q: 'do', limit: 3 }, { ...user, tenantId }),
        ),
      );
    await Promise.all([run(8, 21), run(9, 31)]);

    expect(seen).toHaveLength(18);
    for (const call of seen) {
      expect(call).toEqual(
        call.tenantId === 8
          ? { type: call.type, tenantId: 8, userId: 21 }
          : { type: call.type, tenantId: 9, userId: 31 },
      );
    }
    expect(seen.filter((call) => call.tenantId === 9)).toHaveLength(9);
  });

  it("n'expose jamais une ligne d'un autre cabinet", async () => {
    services.customers.searchWithTransformer.mockResolvedValueOnce(
      page([
        { id: 7, tenant_id: 8, full_name: 'Dupont SARL' },
        { id: 70, tenant_id: 9, full_name: 'Autre cabinet' },
      ]),
    );
    const groups = await service.search({ q: 'du', limit: 3 }, user);
    const client = groups.find((group) => group.type === 'client');
    expect(client?.items.map((item) => item.id)).toEqual([7]);
  });

  it('une catégorie en échec ne prive pas le menu des autres', async () => {
    services.documents.searchWithTransformer.mockRejectedValueOnce(
      new Error('boom'),
    );
    const groups = await service.search({ q: 'do', limit: 3 }, user);
    expect(groups.map((group) => group.type)).not.toContain('document');
    expect(groups).toHaveLength(8);
  });

  it("n'interroge rien pour moins de 2 caractères", async () => {
    expect(await service.search({ q: ' d ', limit: 3 }, user)).toEqual([]);
    expect(seen).toEqual([]);
  });

  it('valide les paramètres (3 résultats par défaut, 10 au plus)', async () => {
    const dto = plainToInstance(MentionSearchDto, { q: ' dupont ' });
    expect(dto).toMatchObject({ q: 'dupont', limit: 3 });
    expect(
      await validate(
        plainToInstance(MentionSearchDto, { q: 'do', limit: '4' }),
      ),
    ).toHaveLength(0);
    for (const input of [
      { limit: '0' },
      { limit: '11' },
      { q: 'a'.repeat(201) },
    ]) {
      expect(
        (await validate(plainToInstance(MentionSearchDto, input))).length,
      ).toBeGreaterThan(0);
    }
  });
});
