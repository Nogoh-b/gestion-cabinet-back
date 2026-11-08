import { ConflictException, ForbiddenException } from '@nestjs/common';
import { loadHelpDocs, matchHelpDocs } from 'src/core/ai-database/help-knowledge';
import { PlatformAuditContext } from '../audit/platform-audit.context';
import { PlatformPrincipal } from '../common/platform-principal';
import { PlatformAssistantService, PROPOSAL_TTL_MS } from './platform-assistant.service';
import { PlatformAssistantProposal } from './platform-assistant.entity';

const admin = (role: PlatformPrincipal['role'], id = 7): PlatformPrincipal => ({
  isPlatform: true,
  id,
  platformAdminId: id,
  email: `${role}@test`,
  full_name: role,
  role,
});

const matches = (row: any, where: any) =>
  Object.entries(where ?? {}).every(([key, value]) => row[key] === value);

function fakeRepo(rows: any[]) {
  return {
    rows,
    find: jest.fn(async (options: any) => rows.filter((row) => matches(row, options?.where))),
    findOne: jest.fn(async (options: any) => rows.find((row) => matches(row, options?.where)) ?? null),
    save: jest.fn(async (entity: any) => {
      const saved = { id: `p${rows.length + 1}`, created_at: new Date(), ...entity };
      rows.push(saved);
      return saved;
    }),
    update: jest.fn(async (where: any, patch: any) => {
      const found = rows.filter((row) => matches(row, where));
      found.forEach((row) => Object.assign(row, patch));
      return { affected: found.length };
    }),
  };
}

function setup(replies: string[] = [], proposals: any[] = []) {
  const proposalRepo = fakeRepo(proposals);
  const messageRepo = fakeRepo([]);
  const db: any = {
    getRepository: (entity: unknown) =>
      entity === PlatformAssistantProposal ? proposalRepo : messageRepo,
    query: jest.fn(async () => [{ name: 'Pro' }]),
  };
  const invoke = jest.fn(async () => ({
    content: replies.shift() ?? JSON.stringify({ answer: 'Fin.' }),
    response_metadata: {},
  }));
  const router: any = { getPlatformModel: jest.fn(async () => ({ invoke })) };
  const cabinets: any = {
    list: jest.fn(async () => ({
      data: [{ id: 5, name: 'Cabinet Alpha' }],
      meta: { total: 1 },
    })),
    listSubscriptions: jest.fn(),
    detail: jest.fn(async () => ({
      id: 5,
      name: 'Cabinet Alpha',
      subscription: { plan_id: 2 },
    })),
    stateVersion: jest.fn(async () => 'v1'),
    grantUnlimited: jest.fn(async () => {
      PlatformAuditContext.set({ action: 'subscription.unlimited_grant', summary: 'Abonnement illimité offert' });
      return { id: 5 };
    }),
    extend: jest.fn(async () => ({ id: 5 })),
  };
  const payments: any = {
    list: jest.fn(async () => ({
      data: [
        {
          cabinet_id: 5,
          cabinet_name: 'Cabinet Alpha',
          amount: 9900,
          currency: 'XAF',
          due_date: '2026-11-01',
          plan_name: 'Pro',
          reference: 'SECRET-REF',
        },
      ],
      meta: { total: 1, amount_total: 9900 },
    })),
  };
  const revenue: any = { overview: jest.fn(async () => ({ mrr: 1 })) };
  const usage: any = { overview: jest.fn() };
  const credits: any = { grant: jest.fn(async () => ({})) };
  const service = new PlatformAssistantService(db, router, cabinets, payments, revenue, usage, credits);
  return { service, invoke, cabinets, payments, revenue, proposalRepo, messageRepo, db };
}

const pending = (overrides: Record<string, any> = {}) => ({
  id: 'prop-1',
  admin_id: 7,
  cabinet_id: 5,
  type: 'grant_unlimited',
  params: { plan_id: 2 },
  title: 'Offrir l’illimité : Cabinet Alpha',
  summary: 'Résumé',
  target_version: 'v1',
  status: 'pending',
  created_at: new Date(),
  ...overrides,
});

describe('documentation plateforme', () => {
  it('a une fiche par page et reste invisible des cabinets', () => {
    const platform = loadHelpDocs('platform');
    expect(platform.length).toBeGreaterThanOrEqual(16);
    expect(loadHelpDocs().some((doc) => doc.id.startsWith('platform-'))).toBe(false);
    expect(
      matchHelpDocs('comment offrir un abonnement illimité à un cabinet').some((match) =>
        match.doc.id.startsWith('platform-'),
      ),
    ).toBe(false);
  });

  it('oriente les deux questions de référence vers la bonne fiche', () => {
    const top = (question: string) => matchHelpDocs(question, { dir: 'platform' })[0]?.doc.id;
    expect(top('comment offrir un abonnement illimité à un cabinet')).toBe('platform-abonnements');
    expect(top('quels sont les impayés')).toBe('platform-paiements');
  });
});

describe('PlatformAssistantService — questions', () => {
  it('répond à une question de procédure avec la fiche, sans action', async () => {
    const ctx = setup([JSON.stringify({ answer: 'Ouvrez la fiche du cabinet.' })]);
    const reply = await ctx.service.ask('comment offrir un abonnement illimité à un cabinet ?', '/platform', admin('owner'));
    expect(reply.answer).toContain('Ouvrez la fiche');
    expect(reply.sources).toContain('Abonnements');
    expect(reply.proposals).toEqual([]);
    const [messages] = ctx.invoke.mock.calls[0] as unknown as [Array<{ content: string }>];
    expect(messages[0].content).toContain('Offrir un abonnement illimité');
    expect(ctx.proposalRepo.rows).toHaveLength(0);
  });

  it('lit les impayés côté serveur, statut due, sans référence de paiement', async () => {
    const ctx = setup([JSON.stringify({ answer: 'Un impayé : Cabinet Alpha.' })]);
    const reply = await ctx.service.ask('Quels sont les impayés ?', undefined, admin('support'));
    expect(ctx.payments.list).toHaveBeenCalledWith(expect.objectContaining({ status: 'due' }));
    expect(reply.tools).toContain('impayes');
    const [messages] = ctx.invoke.mock.calls[0] as unknown as [Array<{ content: string }>];
    const data = messages[messages.length - 1].content;
    expect(data).toContain('Cabinet Alpha');
    expect(data).not.toContain('SECRET-REF');
  });

  it('enchaîne un outil demandé par le modèle puis répond', async () => {
    const ctx = setup([
      JSON.stringify({ tools: [{ name: 'cabinets', args: { search: 'Alpha' } }] }),
      JSON.stringify({ answer: 'Cabinet Alpha trouvé.' }),
    ]);
    const reply = await ctx.service.ask('Trouve Alpha', undefined, admin('owner'));
    expect(ctx.cabinets.list).toHaveBeenCalledWith(expect.objectContaining({ search: 'Alpha' }));
    expect(reply.answer).toBe('Cabinet Alpha trouvé.');
  });

  it('refuse un outil hors liste blanche ou interdit au rôle', async () => {
    const ctx = setup([
      JSON.stringify({ tools: [{ name: 'sql', args: {} }, { name: 'revenus', args: {} }, { name: 'constructor', args: {} }] }),
      JSON.stringify({ answer: 'Je ne peux pas.' }),
    ]);
    await ctx.service.ask('Donne moi tout', undefined, admin('support'));
    expect(ctx.revenue.overview).not.toHaveBeenCalled();
    const [messages] = ctx.invoke.mock.calls[1] as unknown as [Array<{ content: string }>];
    const results = messages[messages.length - 1].content;
    expect(results).toContain('outil inconnu');
    expect(results).toContain('non autorisé');
  });

  it('prépare une proposition sans rien exécuter, avec un résumé du serveur', async () => {
    const ctx = setup([
      JSON.stringify({
        answer: 'Je prépare cette action.',
        actions: [{ type: 'grant_unlimited', cabinet_id: 5, params: { plan_id: 2, title: 'ignoré' } }],
      }),
    ]);
    const reply = await ctx.service.ask('Offre l’illimité à Alpha', undefined, admin('finance'));
    expect(reply.proposals).toHaveLength(1);
    expect(reply.proposals[0].summary).toContain('Cabinet Alpha');
    expect(reply.proposals[0].summary).toContain('Pro');
    expect(ctx.proposalRepo.rows[0].params).toEqual({ plan_id: 2 });
    expect(ctx.cabinets.grantUnlimited).not.toHaveBeenCalled();
  });

  it('écarte une action hors liste ou interdite au rôle', async () => {
    const ctx = setup([
      JSON.stringify({
        answer: 'Tentative.',
        actions: [
          { type: 'delete_cabinet', cabinet_id: 5, params: {} },
          { type: 'grant_unlimited', cabinet_id: 5, params: { plan_id: 2 } },
        ],
      }),
    ]);
    const reply = await ctx.service.ask('Supprime Alpha', undefined, admin('support'));
    expect(reply.proposals).toEqual([]);
    expect(reply.warnings).toHaveLength(2);
    expect(ctx.proposalRepo.rows).toHaveLength(0);
  });
});

describe('PlatformAssistantService — acceptation', () => {
  it('refuse l’acceptation quand le rôle ne permet plus l’action', async () => {
    const ctx = setup([], [pending()]);
    await expect(ctx.service.accept('prop-1', admin('support'))).rejects.toBeInstanceOf(ForbiddenException);
    expect(ctx.cabinets.grantUnlimited).not.toHaveBeenCalled();
    expect(ctx.proposalRepo.rows[0].status).toBe('pending');
  });

  it('refuse la proposition d’un autre administrateur', async () => {
    const ctx = setup([], [pending()]);
    await expect(ctx.service.accept('prop-1', admin('owner', 99))).rejects.toThrow('introuvable');
    expect(ctx.cabinets.grantUnlimited).not.toHaveBeenCalled();
  });

  it('exécute une seule fois les paramètres stockés et écrit le journal', async () => {
    const ctx = setup([], [pending()]);
    const owner = admin('owner');
    await PlatformAuditContext.run(async () => {
      await ctx.service.accept('prop-1', owner);
      expect(PlatformAuditContext.get()).toMatchObject({
        action: 'subscription.unlimited_grant',
        cabinetId: 5,
        summary: expect.stringContaining('assistant IA, proposition prop-1'),
      });
    });
    expect(ctx.cabinets.grantUnlimited).toHaveBeenCalledWith(5, { plan_id: 2, note: undefined }, owner);
    expect(ctx.proposalRepo.rows[0].status).toBe('accepted');
    await expect(ctx.service.accept('prop-1', owner)).rejects.toBeInstanceOf(ConflictException);
    expect(ctx.cabinets.grantUnlimited).toHaveBeenCalledTimes(1);
  });

  it('refuse une proposition dépassée par un changement du cabinet', async () => {
    const ctx = setup([], [pending({ target_version: 'ancienne' })]);
    await expect(ctx.service.accept('prop-1', admin('owner'))).rejects.toBeInstanceOf(ConflictException);
    expect(ctx.cabinets.grantUnlimited).not.toHaveBeenCalled();
    expect(ctx.proposalRepo.rows[0].status).toBe('stale');
  });

  it('refuse une proposition expirée', async () => {
    const ctx = setup([], [pending({ created_at: new Date(Date.now() - PROPOSAL_TTL_MS - 1000) })]);
    await expect(ctx.service.accept('prop-1', admin('owner'))).rejects.toBeInstanceOf(ConflictException);
    expect(ctx.cabinets.grantUnlimited).not.toHaveBeenCalled();
  });

  it('remet la proposition en attente si l’exécution échoue', async () => {
    const ctx = setup([], [pending()]);
    ctx.cabinets.grantUnlimited.mockRejectedValueOnce(new Error('Paiement à valider'));
    await expect(ctx.service.accept('prop-1', admin('owner'))).rejects.toThrow('Paiement à valider');
    expect(ctx.proposalRepo.rows[0].status).toBe('pending');
  });
});
