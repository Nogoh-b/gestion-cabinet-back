/// <reference types="jest" />
import { ForbiddenException } from '@nestjs/common';
import { AiDatabasePermissionService } from './ai-database-permission.service';
import { GenericWriteService } from './generic-write.service';
import { IntentDetectionService } from './intent-detection.service';
import { PlanFieldsService } from './plan-fields.service';
import { AiActionHandler, AiActionRegistry, normalizeActionName } from './write/ai-action.registry';
import { AmbiguityException, ALL_MATCHING_TARGETS } from './write/ambiguity.exception';
import { EntityIdRequiredException } from './write/entity-id-required.exception';
import { summarizeWriteResults } from './write/write-result-summary';

class Facture {}

/** Action « envoyer_facture » dont l'envoi est enregistré dans `sent`. */
function createRegistry(options: { failSend?: boolean } = {}) {
  const sent: Array<{ id: string | number; email?: string }> = [];
  const handler: AiActionHandler = {
    definition: {
      name: 'envoyer_facture',
      entity: 'factures',
      label: 'Envoi de la facture par e-mail',
      description: 'Envoie une facture au client par e-mail.',
      permission: 'email_facture',
      params: [{ name: 'email', label: 'Destinataire' }],
      warning: 'Irréversible',
    },
    prepare: jest.fn(async (id: string | number, params: Record<string, any>) => ({
      data: { id, numero: `FAC-${id}`, dossier_id: 91 },
      plannedMessage: `Facture FAC-${id} à envoyer.`,
      run: async () => {
        if (options.failSend) throw new Error('SMTP indisponible');
        sent.push({ id, email: params.email });
        return `Facture FAC-${id} envoyée à ${params.email ?? 'client@exemple.cm'}.`;
      },
    })),
    preview: jest.fn(async () => 'À : client@exemple.cm'),
  };
  const registry = new AiActionRegistry();
  (registry as any).logger = { log: jest.fn() };
  registry.register(handler);
  return { registry, handler, sent };
}

/** GenericWriteService sur une table `factures` en mémoire. */
function createWriteService(registry: AiActionRegistry, rows: any[] = [], handlers: Record<string, any> = {}) {
  const find = jest.fn(async ({ where = {}, take = 50 }: any) =>
    rows.filter((row) => Object.entries(where).every(([k, v]) => String(row[k]) === String(v))).slice(0, take),
  );
  const queryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
  };
  const dataSource: any = {
    entityMetadatas: [
      {
        tableName: 'factures',
        name: 'Facture',
        target: Facture,
        relations: [],
        manyToOneRelations: [],
        columns: ['id', 'numero', 'status', 'dossier_id'].map((name) => ({ propertyName: name, databaseName: name })),
      },
    ],
    createQueryRunner: () => queryRunner,
    getRepository: jest.fn(() => ({
      find,
      count: jest.fn(async ({ where = {} }: any) => (await find({ where, take: 1000 })).length),
    })),
  };
  const service: any = new GenericWriteService(dataSource, { getHandler: (entity: string) => handlers[entity] } as any, registry);
  service.logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
  return { service, queryRunner };
}

const action = (extra: Record<string, any> = {}) => ({
  operation: 'ACTION' as const,
  action: 'envoyer_facture',
  entity: 'factures',
  fields: {},
  humanReadable: 'Envoyer la facture',
  ...extra,
});

describe('Registre des actions du chat', () => {
  it('reconnaît une action écrite librement par le modèle', () => {
    const { registry } = createRegistry();
    expect(normalizeActionName('Envoyer-Facture')).toBe('envoyer_facture');
    expect(registry.get('envoyer facture')?.definition.name).toBe('envoyer_facture');
    expect(registry.get('supprimer_tout')).toBeUndefined();
  });

  it('décrit les actions au planificateur, avec leurs paramètres', () => {
    const section = createRegistry().registry.promptSection();
    expect(section).toContain('"operation": "ACTION"');
    expect(section).toContain('"envoyer_facture" (entity "factures")');
    expect(section).toContain('email (facultatif)');
    expect(new AiActionRegistry().promptSection()).toBe('');
  });
});

describe('Exécution d’une opération ACTION', () => {
  it('n’envoie qu’une fois le plan validé, et rend compte de l’envoi', async () => {
    const { registry, handler, sent } = createRegistry();
    const { service, queryRunner } = createWriteService(registry);
    queryRunner.commitTransaction.mockImplementation(() => {
      expect(sent).toHaveLength(0);
    });

    const [result] = await service.executePlan(
      { transaction: true, humanReadable: '', confidence: 1, operations: [action({ entityId: 'f-1', fields: { email: 'compta@client.cm' } })] },
      '7',
    );

    expect(handler.prepare).toHaveBeenCalledWith('f-1', { email: 'compta@client.cm' }, '7');
    expect(sent).toEqual([{ id: 'f-1', email: 'compta@client.cm' }]);
    expect(result).toMatchObject({ success: true, operation: 'ACTION', entity: 'factures', message: 'Facture FAC-f-1 envoyée à compta@client.cm.' });
    expect(result.afterCommit).toBeUndefined();
  });

  it('vise la facture créée plus tôt dans le même plan', async () => {
    const { registry, sent } = createRegistry();
    const factureHandler = {
      execute: jest.fn(async () => ({ success: true, operation: 'INSERT', entityId: 'f-new', affected: 1, data: { id: 'f-new' }, message: 'ok' })),
    };
    const { service } = createWriteService(registry, [], { factures: factureHandler });

    await service.executePlan(
      {
        transaction: true,
        humanReadable: '',
        confidence: 1,
        operations: [
          { operation: 'INSERT', entity: 'factures', tempId: 'facture_1', fields: { dossier: 'DOS-2026-0001', montantHT: 1000 }, humanReadable: '' },
          action({ entityId: '{{facture_1.id}}' }),
        ],
      },
      '7',
    );
    expect(sent.map((s) => s.id)).toEqual(['f-new']);
  });

  it('n’envoie rien quand une autre opération du plan échoue', async () => {
    const { registry, sent } = createRegistry();
    const failing = { execute: jest.fn(async () => { throw new Error('montant manquant'); }) };
    const { service } = createWriteService(registry, [], { customer: failing });

    await expect(
      service.executePlan(
        {
          transaction: true,
          humanReadable: '',
          confidence: 1,
          operations: [action({ entityId: 'f-1' }), { operation: 'INSERT', entity: 'customer', fields: {}, humanReadable: '' }],
        },
        '7',
      ),
    ).rejects.toThrow('montant manquant');
    expect(sent).toHaveLength(0);
  });

  it('signale un envoi échoué sans faire échouer le plan déjà validé', async () => {
    const { registry } = createRegistry({ failSend: true });
    const { service } = createWriteService(registry);
    const [result] = await service.executePlan(
      { transaction: true, humanReadable: '', confidence: 1, operations: [action({ entityId: 'f-1' })] },
      '7',
    );
    expect(result.success).toBe(false);
    expect(result.message).toBe('Envoi de la facture par e-mail : échec — SMTP indisponible');
  });

  it('retrouve la facture par son numéro, et fait choisir sans proposer « Tous »', async () => {
    const rows = [
      { id: 'f-1', numero: 'FAC-2026-0003', status: 1 },
      { id: 'f-2', numero: 'FAC-2026-0004', status: 1 },
    ];
    const { registry, sent } = createRegistry();
    const { service } = createWriteService(registry, rows);

    await service.executePlan(
      { transaction: true, humanReadable: '', confidence: 1, operations: [action({ match: { numero: 'FAC-2026-0004' } })] },
      '7',
    );
    expect(sent.map((s) => s.id)).toEqual(['f-2']);

    const error = await service
      .executePlan({ transaction: true, humanReadable: '', confidence: 1, operations: [action({ match: { status: 1 } })] }, '7')
      .catch((e: any) => e);
    expect(error).toBeInstanceOf(AmbiguityException);
    expect(error.purpose).toBe('action');
    expect(error.candidates.map((c: any) => c.id)).not.toContain(ALL_MATCHING_TARGETS);
    expect(error.operationIndex).toBe(0);
  });

  it('demande quelle facture envoyer quand rien ne la désigne', async () => {
    const { registry } = createRegistry();
    const { service } = createWriteService(registry);
    const error = await service
      .executePlan({ transaction: true, humanReadable: '', confidence: 1, operations: [action()] }, '7')
      .catch((e: any) => e);
    expect(error).toBeInstanceOf(EntityIdRequiredException);
  });

  it('refuse une action inconnue', async () => {
    const { registry } = createRegistry();
    const { service } = createWriteService(registry);
    await expect(
      service.executePlan(
        { transaction: true, humanReadable: '', confidence: 1, operations: [action({ action: 'vider_la_base', entityId: 1 })] },
        '7',
      ),
    ).rejects.toThrow('Action inconnue');
  });
});

describe('Planificateur : demandes d’envoi', () => {
  const { registry } = createRegistry();
  const service = new IntentDetectionService(
    { getAllHandlers: jest.fn(() => []), generateGlobalWriteSchema: jest.fn(async () => '') } as any,
    { domainKeywords: ['dossier', 'facture', 'client'] } as any,
    registry,
  );

  it('classe un envoi à l’impératif en action, même avec « la dernière facture »', () => {
    expect(service.classifyLocal('Envoie la dernière facture au client')).toBe('WRITE');
    expect(service.classifyLocal('relance le client du dossier DOS-2026-0001')).toBe('WRITE');
    expect(service.classifyLocal('peux-tu transmettre la facture FAC-2026-0003 ?')).toBe('WRITE');
  });

  it('laisse « envoie-moi la liste » et les questions sur les relances en lecture', () => {
    expect(service.classifyLocal('envoie-moi la liste des factures impayées')).not.toBe('WRITE');
    expect(service.classifyLocal('liste les relances envoyées ce mois')).toBe('READ');
  });

  it('exige toujours la confirmation, et lit la cible mise dans les champs', async () => {
    const planner = {
      invoke: jest.fn(async () => ({
        content: JSON.stringify({
          type: 'WRITE',
          writePlan: {
            transaction: true,
            humanReadable: 'Envoyer la facture FAC-2026-0003',
            confidence: 0.98,
            operations: [{ operation: 'ACTION', action: 'Envoyer facture', fields: { numero: 'FAC-2026-0003' } }],
          },
        }),
      })),
    } as any;
    const result = await service.detectIntent('envoie la facture FAC-2026-0003', planner, '', { plannerLlm: planner });
    expect(result.requiresConfirmation).toBe(true);
    expect(result.writePlan?.operations[0]).toMatchObject({
      operation: 'ACTION',
      action: 'envoyer_facture',
      entity: 'factures',
      match: { numero: 'FAC-2026-0003' },
      fields: {},
    });
  });

  it('redemande un plan quand le modèle invente une action', async () => {
    const answers = [
      { operation: 'ACTION', action: 'imprimer_facture', entity: 'factures', entityId: 'f-1', fields: {} },
      { operation: 'ACTION', action: 'envoyer_facture', entity: 'factures', entityId: 'f-1', fields: {} },
    ].map((op) => JSON.stringify({ type: 'WRITE', writePlan: { operations: [op], humanReadable: 'x', confidence: 0.9 } }));
    let call = 0;
    const planner = { invoke: jest.fn(async () => ({ content: answers[call++] })) } as any;
    const result = await service.detectIntent('envoie la facture', planner, '', { plannerLlm: planner });
    expect(planner.invoke).toHaveBeenCalledTimes(2);
    expect(result.writePlan?.operations[0].action).toBe('envoyer_facture');
  });
});

describe('Droits sur les actions', () => {
  function permissionService(codes: string[]) {
    const usersService = {
      getUserPermissions: jest.fn().mockResolvedValue(codes.map((code) => ({ code }))),
      findOne: jest.fn().mockResolvedValue({ role_name: 'Avocat' }),
    };
    const service = new AiDatabasePermissionService(usersService as any, {} as any, createRegistry().registry);
    (service as any).logger = { warn: jest.fn(), log: jest.fn() };
    return service;
  }
  const plan = (op: any) => ({ transaction: true, humanReadable: '', confidence: 1, operations: [op] });

  it('exige la permission du bouton « Envoyer » (email_facture)', async () => {
    const user = { id: 31, permissions: ['view_factures'] };
    await expect(permissionService(['view_factures']).assertCanWritePlan(user, plan(action({ entityId: 'f-1' })))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      permissionService(['email_facture']).assertCanWritePlan({ id: 31, permissions: ['email_facture'] }, plan(action({ entityId: 'f-1' }))),
    ).resolves.toBeUndefined();
  });

  it('refuse une action inconnue, même pour un administrateur', async () => {
    await expect(
      permissionService([]).assertCanWritePlan({ id: 1, role: 'admin' }, plan(action({ action: 'vider_la_base' }))),
    ).rejects.toThrow('Action inconnue');
  });
});

describe('Compte rendu d’une action', () => {
  const labels = {
    table: (entity: string) => ({ factures: 'Facture', dossiers: 'Dossier' } as Record<string, string>)[entity] ?? entity,
    column: (_entity: string, column: string) => column,
    value: () => null,
  };

  it('liste l’envoi avec un lien vers la facture et son dossier', () => {
    const text = summarizeWriteResults(
      [
        {
          success: true,
          operation: 'ACTION',
          entity: 'factures',
          entityId: 'f-1',
          affected: 0,
          data: { id: 'f-1', numero: 'FAC-2026-0003', dossier_id: 91 },
          message: 'Facture FAC-2026-0003 envoyée à client@exemple.cm.',
          changedFields: [],
        },
      ],
      labels,
      new Map([['dossiers:91', 'DOS-2026-0001']]),
    );
    expect(text).toContain('**📧 Envoyé**');
    expect(text).toContain('- Facture FAC-2026-0003 envoyée à client@exemple.cm.\n  Facture [FAC-2026-0003](/facturation/factures/f-1) · Dossier [DOS-2026-0001](/dossiers/91)');
  });

  it('range un envoi échoué parmi les échecs', () => {
    const text = summarizeWriteResults(
      [{ success: false, operation: 'ACTION', entity: 'factures', affected: 0, message: 'Envoi : échec — SMTP indisponible' }],
      labels,
    );
    expect(text).toContain('**❌ Échecs**\n- Envoi : échec — SMTP indisponible');
  });
});

describe('Carte de confirmation d’une action', () => {
  const rows = [{ id: 'f-2', numero: 'FAC-2026-0004', status: 1 }];
  function build() {
    const { registry, handler } = createRegistry();
    const writes = createWriteService(registry, rows).service;
    const factureMeta = {
      tableName: 'factures',
      target: Facture,
      columns: [],
      relations: [],
      findColumnWithDatabaseName: () => undefined,
      findColumnWithPropertyName: () => undefined,
    };
    const dataSource: any = {
      entityMetadatas: [factureMeta],
      getRepository: () => ({ findOne: jest.fn(async ({ where }: any) => rows.find((r) => r.id === where.id) ?? null) }),
    };
    const service = new PlanFieldsService(
      dataSource,
      { getHandler: () => undefined } as any,
      {
        getTableLabel: () => 'Factures',
        formatTechnicalName: (n: string) => n,
        getColumnMetadataMap: () => new Map(),
        getColumnDescription: () => '',
      } as any,
      {} as any,
      { assertCanWritePlan: jest.fn(async () => undefined) } as any,
      undefined,
      writes,
      registry,
    );
    return { service, handler };
  }

  it('annonce la facture visée, le destinataire et l’avertissement', async () => {
    const { service, handler } = build();
    const { operations } = await service.describePlan(1, {
      transaction: true,
      humanReadable: '',
      confidence: 1,
      operations: [action({ match: { numero: 'FAC-2026-0004' } })],
    });
    expect(operations[0]).toMatchObject({
      entityLabel: 'Envoi de la facture par e-mail',
      target: 'FAC-2026-0004',
      preview: 'À : client@exemple.cm',
      warning: 'Irréversible',
      fields: [{ name: 'email', label: 'Destinataire', kind: 'text', editable: true }],
    });
    expect(handler.preview).toHaveBeenCalledWith('f-2', {});
  });

  it('nomme la facture créée par le plan, sans aperçu', async () => {
    const { service, handler } = build();
    const { operations } = await service.describePlan(1, {
      transaction: true,
      humanReadable: '',
      confidence: 1,
      operations: [
        { operation: 'INSERT', entity: 'factures', tempId: 'facture_1', fields: { description: 'Honoraires juin' }, humanReadable: '' },
        action({ entityId: '{{facture_1.id}}' }),
      ],
    });
    expect(operations[1].target).toContain('(créé par ce plan)');
    expect(operations[1].preview).toBeUndefined();
    expect(handler.preview).not.toHaveBeenCalled();
  });
});
