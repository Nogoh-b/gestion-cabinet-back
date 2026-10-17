import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Audience } from 'src/modules/audiences/entities/audience.entity';
import { DocumentCustomer } from 'src/modules/documents/document-customer/entities/document-customer.entity';
import { ActionLinkRole, DossierActionStatus } from '../case-workflow.enums';
import { ActionDefinition } from '../entities/action-catalog.entity';
import {
  DossierAction,
  DossierActionAudienceLink,
  DossierActionDocumentLink,
  DossierActionRelation,
} from '../entities/dossier-action.entity';
import {
  DossierActionAiWriteHandler,
  PLAN_CREATED,
} from './dossier-action-ai.handler';

const DOSSIER = 91;
const AUDIENCE_DEF = 'def-audience';
const FREE_DEF = 'def-libre';

const inDays = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
};

/** Base en mémoire : chaque repository filtre ses lignes sur `where`. */
function createDb() {
  const tables = new Map<any, any[]>([
    [ActionDefinition, [
      { id: AUDIENCE_DEF, tenant_id: 1, required_relations: { audiences: { min: 1 } } },
      { id: FREE_DEF, tenant_id: 1, required_relations: null },
    ]],
    [DocumentCustomer, [
      { id: 40, tenant_id: 1, dossier_id: DOSSIER, name: 'Contrat_de_bail.pdf', is_confidential: false },
    ]],
    [Audience, [
      { id: 3, tenant_id: 1, dossier_id: String(DOSSIER), audience_date: inDays(-20) },
      { id: 4, tenant_id: 1, dossier_id: String(DOSSIER), audience_date: inDays(10) },
    ]],
    [DossierAction, [
      { id: 'act-old', tenant_id: 1, dossier_id: DOSSIER, title: 'Mise en demeure', status: DossierActionStatus.COMPLETED },
    ]],
    [DossierActionDocumentLink, []],
    [DossierActionAudienceLink, []],
    [DossierActionRelation, []],
  ]);
  // Le handler lit aussi l’action par son nom de table.
  tables.set('dossier_actions', tables.get(DossierAction)!);
  const matches = (row: any, where: any = {}) =>
    Object.entries(where).every(([key, value]) => String(row[key]) === String(value));
  const dataSource = {
    getRepository: (entity: any) => ({
      find: jest.fn(async (options: any = {}) =>
        (tables.get(entity) ?? []).filter((row) => matches(row, options.where)),
      ),
      findOne: jest.fn(async (options: any = {}) =>
        (tables.get(entity) ?? []).find((row) => matches(row, options.where)) ?? null,
      ),
    }),
  };
  return { tables, dataSource };
}

function createHandler(db = createDb()) {
  const actionService = {
    create: jest.fn(async (_dossierId: number, dto: any) => ({
      id: 'act-new',
      title: dto.title ?? 'Action',
    })),
    updateDetails: jest.fn(async (id: string) => ({ id, title: 'Action', lock_version: 2 })),
    complete: jest.fn(async (id: string) => ({ id, title: 'Action' })),
  };
  const handler = Object.create(
    DossierActionAiWriteHandler.prototype,
  ) as DossierActionAiWriteHandler;
  for (const [key, value] of Object.entries({
    dataSource: db.dataSource,
    actionService,
    logger: { log: jest.fn(), warn: jest.fn(), debug: jest.fn() },
  })) {
    Object.defineProperty(handler, key, { value });
  }
  return { handler: handler as any, actionService, db };
}

const createdDto = (service: { create: jest.Mock }) => service.create.mock.calls[0][1] as any;

describe('DossierActionAiWriteHandler — liens des ressources', () => {
  let ctx: ReturnType<typeof createHandler>;
  beforeEach(() => {
    ctx = createHandler();
  });

  it('chaîne une action sur la précédente créée dans le même plan', async () => {
    await ctx.handler.doInsert(
      {
        dossier_id: DOSSIER,
        definition_id: FREE_DEF,
        [PLAN_CREATED]: [
          { entity: 'dossier_actions', id: 'act-1', data: { id: 'act-1', dossier_id: DOSSIER } },
        ],
      },
      '5',
    );

    expect(createdDto(ctx.actionService).previous_actions).toEqual([
      { id: 'act-1', role: ActionLinkRole.DEPENDS_ON },
    ]);
  });

  it('ne chaîne pas une action déclarée indépendante ([])', async () => {
    await ctx.handler.doInsert(
      {
        dossier_id: DOSSIER,
        definition_id: FREE_DEF,
        previous_actions: [],
        [PLAN_CREATED]: [
          { entity: 'dossier_actions', id: 'act-1', data: { dossier_id: DOSSIER } },
        ],
      },
      '5',
    );

    expect(createdDto(ctx.actionService).previous_actions).toBeUndefined();
  });

  it('relie l’audience créée dans le plan quand la définition en exige une', async () => {
    await ctx.handler.doInsert(
      {
        dossier_id: DOSSIER,
        definition_id: AUDIENCE_DEF,
        [PLAN_CREATED]: [
          { entity: 'audiences', id: 77, data: { id: 77, dossier_id: String(DOSSIER) } },
        ],
      },
      '5',
    );

    expect(createdDto(ctx.actionService).audiences).toEqual([
      { id: 77, role: ActionLinkRole.INPUT },
    ]);
  });

  it('sinon relie la prochaine audience du dossier plutôt qu’une audience passée', async () => {
    const result = await ctx.handler.doInsert(
      { dossier_id: DOSSIER, definition_id: AUDIENCE_DEF, [PLAN_CREATED]: [] },
      '5',
    );

    expect(createdDto(ctx.actionService).audiences).toEqual([
      { id: 4, role: ActionLinkRole.INPUT },
    ]);
    expect(result.message).toContain('liée à : 1 audience');
  });

  it('résout les liens demandés par nom ou titre, et note ceux introuvables sans échouer', async () => {
    const result = await ctx.handler.doInsert(
      {
        dossier_id: DOSSIER,
        definition_id: FREE_DEF,
        documents: ['contrat de bail', 'Inconnu.pdf'],
        previous_actions: ['mise en demeure'],
        [PLAN_CREATED]: [],
      },
      '5',
    );

    const dto = createdDto(ctx.actionService);
    expect(dto.documents).toEqual([{ id: 40, role: ActionLinkRole.INPUT }]);
    expect(dto.previous_actions).toEqual([
      { id: 'act-old', role: ActionLinkRole.DEPENDS_ON },
    ]);
    expect(result.success).toBe(true);
    expect(result.message).toContain('« Inconnu.pdf » introuvable dans ce dossier');
  });

  it('à la clôture, complète l’audience exigée par la définition', async () => {
    ctx.db.tables.get(DossierAction)!.push({
      id: 'act-aud', tenant_id: 1, dossier_id: DOSSIER, definition_id: AUDIENCE_DEF,
      title: 'Plaider', status: DossierActionStatus.IN_PROGRESS, lock_version: 4,
    });

    await ctx.handler.doUpdate('act-aud', { status: 'terminée', result_code: 'HELD' }, '5');

    const [id, dto] = ctx.actionService.complete.mock.calls[0] as any[];
    expect(id).toBe('act-aud');
    expect(dto.expected_version).toBe(4);
    expect(dto.audiences).toEqual([{ id: 4, role: ActionLinkRole.INPUT }]);
  });

  it('en mise à jour, ajoute les liens demandés à ceux déjà enregistrés', async () => {
    ctx.db.tables.get(DossierAction)!.push({
      id: 'act-x', tenant_id: 1, dossier_id: DOSSIER, definition_id: FREE_DEF,
      title: 'Préparer', status: DossierActionStatus.TODO, lock_version: 1,
    });
    ctx.db.tables.get(DossierActionAudienceLink)!.push({
      tenant_id: 1, action_id: 'act-x', audience_id: 3, role: ActionLinkRole.INPUT,
    });
    const in10 = inDays(10);
    const date = `${String(in10.getDate()).padStart(2, '0')}/${String(in10.getMonth() + 1).padStart(2, '0')}/${in10.getFullYear()}`;

    await ctx.handler.doUpdate('act-x', { audiences: [date] }, '5');

    const [, dto] = ctx.actionService.updateDetails.mock.calls[0] as any[];
    expect(dto.audiences).toEqual([
      { id: 3, role: ActionLinkRole.INPUT },
      { id: 4, role: ActionLinkRole.INPUT },
    ]);
  });
});
