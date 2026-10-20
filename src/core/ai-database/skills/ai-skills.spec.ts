/// <reference types="jest" />
import { ForbiddenException } from '@nestjs/common';

import { PlanQuotaService } from 'src/modules/plans/plan-quota.service';
import { AiDatabasePermissionService } from '../ai-database-permission.service';
import { GenericWriteService } from '../generic-write.service';
import { actionTargetTable, AiActionHandler, AiActionRegistry } from '../write/ai-action.registry';
import { AiSkillRegistry } from './ai-skill.registry';
import { AiSkillService } from './ai-skill.service';
import type { AiSkillContext, AiSkillHandler } from './ai-skill.types';
import { findTarget, parseLlmJson, resolveSkillTarget, textToHtml } from './skill-helpers';

function skill(code: string, extra: Partial<AiSkillHandler['definition']> = {}): AiSkillHandler {
  return {
    definition: { code, label: code, description: '', icon: 'mail', category: 'communication', placeholder: '', ...extra },
    run: jest.fn(async () => ({ type: 'answer' as const, markdown: `ok ${code}` })),
  };
}

function skillService(options: { permissions?: string[]; role?: string; plan?: any } = {}) {
  const registry = new AiSkillRegistry();
  (registry as any).logger = { log: jest.fn() };
  registry.register(skill('rapport_activite', { category: 'rapports', permissions: ['view_reports'], planModule: 'reporting' }));
  registry.register(skill('envoyer_email'));
  registry.register(skill('envoyer_facture', { permissions: ['email_facture'] }));
  registry.register(skill('programmer_audience', { category: 'agenda' }));
  const permissions = {
    missingPermissions: jest.fn(async (_user: any, codes: string[]) =>
      options.role === 'admin' ? [] : codes.filter((code) => !(options.permissions ?? []).includes(code))),
  } as unknown as AiDatabasePermissionService;
  const planQuota = {
    getCabinetPlan: jest.fn(async () => options.plan ?? null),
    assertModuleEnabled: jest.fn((plan: any, module: string) => {
      if (!PlanQuotaService.planIncludes(plan, module as any)) throw new ForbiddenException(`Module ${module} absent`);
    }),
  } as unknown as PlanQuotaService;
  return { service: new AiSkillService(registry, permissions, planQuota), registry };
}

const ctx = (extra: Partial<AiSkillContext> = {}): AiSkillContext => ({
  question: '',
  references: [],
  documents: [],
  params: {},
  user: { id: 31 },
  userId: '31',
  history: [],
  llm: { complete: jest.fn(), stream: jest.fn() },
  status: jest.fn(),
  readDocuments: jest.fn(async () => []),
  legalSources: jest.fn(async () => ''),
  ...extra,
});

describe('Catalogue des compétences', () => {
  it('ne propose que les compétences permises, rangées par famille', async () => {
    const { service } = skillService({ permissions: ['view_reports'] });
    const codes = (await service.catalog({ id: 31 })).map((item) => item.code);
    expect(codes).toEqual(['envoyer_email', 'rapport_activite', 'programmer_audience']);
  });

  it('masque une compétence dont le module n’est pas dans le plan', async () => {
    const { service } = skillService({ role: 'admin', plan: { reporting_enabled: false, ai_enabled: true } });
    const codes = (await service.catalog({ id: 1, role: 'admin', tenantId: 25 })).map((item) => item.code);
    expect(codes).not.toContain('rapport_activite');
    expect(codes).toContain('envoyer_facture');
  });

  it('refuse d’exécuter une compétence sans la permission du bouton', async () => {
    const { service } = skillService({ permissions: [] });
    await expect(service.run('envoyer_facture', ctx())).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.run('envoyer_email', ctx())).resolves.toEqual({ type: 'answer', markdown: 'ok envoyer_email' });
  });

  it('refuse une compétence inconnue', async () => {
    const { service } = skillService();
    await expect(service.run('vider_la_base', ctx())).rejects.toThrow('Compétence inconnue');
  });
});

describe('Cible d’une compétence', () => {
  const page = { type: 'dossier', label: 'DOS-2026-0001', data: { id: 91 } };
  const mention = { type: 'client', label: 'Jean Dupont', data: { id: 83 } };

  it('préfère la mention @ à la fiche ouverte, puis l’ordre des types', () => {
    expect(findTarget([page, mention], ['client', 'dossier'])).toMatchObject({ type: 'client', id: 83, table: 'customer' });
    expect(findTarget([page, mention], ['dossier', 'client'])).toMatchObject({ type: 'dossier', id: 91, table: 'dossiers' });
    expect(findTarget([page], ['facture'])).toBeUndefined();
  });

  it('accepte l’identifiant UUID d’une facture mentionnée', () => {
    const uuid = '0e8487eb-b679-4369-aeb5-ca2cb688176d';
    expect(findTarget([{ type: 'facture', label: 'FAC-2026-0044', id: uuid }], ['facture']))
      .toMatchObject({ type: 'facture', id: uuid, table: 'factures' });
    expect(findTarget([{ type: 'facture', label: 'FAC', id: 'DROP TABLE' }, { type: 'dossier', label: 'D', id: '0' }], ['facture', 'dossier']))
      .toBeUndefined();
  });

  it('reprend la cible transmise par un bouton de suite', () => {
    expect(resolveSkillTarget({ references: [page], params: { target: { type: 'audience', id: 12, label: 'Audience' } } }, ['audience', 'dossier']))
      .toMatchObject({ type: 'audience', id: 12, table: 'audiences' });
    // Type non accepté par la compétence : les mentions décident.
    expect(resolveSkillTarget({ references: [page], params: { target: { type: 'facture', id: 5 } } }, ['dossier']))
      .toMatchObject({ type: 'dossier', id: 91 });
  });
});

describe('Rédaction', () => {
  it('lit le JSON du modèle, balises et texte autour compris', () => {
    expect(parseLlmJson('Voici :\n```json\n{"subject": "Audience"}\n```')).toEqual({ subject: 'Audience' });
    expect(parseLlmJson('pas de json')).toBeNull();
  });

  it('tolère les retours à la ligne bruts dans les chaînes, sans toucher aux échappements', () => {
    expect(parseLlmJson('{\n  "body": "Madame,\n\n\tVotre audience\r\nest confirmée.",\n  "cite": "il a dit \\"oui\\"\\n"\n}'))
      .toEqual({ body: 'Madame,\n\n\tVotre audience\nest confirmée.', cite: 'il a dit "oui"\n' });
  });

  it('met le texte rédigé en paragraphes HTML échappés', () => {
    expect(textToHtml('Bonjour <Jean>,\n\nLigne 1\nLigne 2')).toBe('<p>Bonjour &lt;Jean&gt;,</p>\n<p>Ligne 1<br>Ligne 2</p>');
  });
});

describe('Action à plusieurs cibles (e-mail lié à un dossier…)', () => {
  function emailAction(): AiActionHandler {
    return {
      definition: {
        name: 'envoyer_email', entity: 'customer', targets: ['dossiers', 'audiences'], skillOnly: true,
        label: "Envoi d'un e-mail", description: '', permission: '',
        params: [{ name: 'subject', label: 'Objet', required: true }, { name: 'body', label: 'Message', required: true, kind: 'longtext' }],
      },
      prepare: jest.fn(async (id: string | number) => ({ data: { id }, plannedMessage: 'E-mail à envoyer.', run: async () => 'E-mail envoyé.' })),
    };
  }

  it('garde la table visée par le plan quand l’action l’accepte', () => {
    const handler = emailAction();
    expect(actionTargetTable(handler, 'dossiers')).toBe('dossiers');
    expect(actionTargetTable(handler, 'factures')).toBe('customer');
    expect(actionTargetTable(handler, undefined)).toBe('customer');
  });

  it('prépare l’action sur cette table et la rend au compte rendu', async () => {
    const registry = new AiActionRegistry();
    (registry as any).logger = { log: jest.fn() };
    const handler = emailAction();
    registry.register(handler);
    const queryRunner = { connect: jest.fn(), startTransaction: jest.fn(), commitTransaction: jest.fn(), rollbackTransaction: jest.fn(), release: jest.fn() };
    const dataSource: any = { entityMetadatas: [], createQueryRunner: () => queryRunner, getRepository: jest.fn() };
    const service: any = new GenericWriteService(dataSource, { getHandler: () => undefined } as any, registry);
    service.logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };

    const [result] = await service.executePlan({
      transaction: true, humanReadable: '', confidence: 1,
      operations: [{ operation: 'ACTION', action: 'envoyer_email', entity: 'dossiers', entityId: 91, fields: { subject: 'Point', body: 'Bonjour', extra: 'x' }, humanReadable: '' }],
    }, '31');

    expect(handler.prepare).toHaveBeenCalledWith(91, { subject: 'Point', body: 'Bonjour' }, '31', 'dossiers');
    expect(result).toMatchObject({ success: true, entity: 'dossiers', message: 'E-mail envoyé.' });
  });

  it('reste hors du prompt du planificateur, et n’exige aucune permission dédiée', async () => {
    const registry = new AiActionRegistry();
    (registry as any).logger = { log: jest.fn() };
    registry.register(emailAction());
    expect(registry.promptSection()).toBe('');

    const usersService = { getUserPermissions: jest.fn().mockResolvedValue([]), findOne: jest.fn().mockResolvedValue({ role_name: 'Avocat' }) };
    const permissions = new AiDatabasePermissionService(usersService as any, {} as any, registry);
    (permissions as any).logger = { warn: jest.fn(), log: jest.fn() };
    await expect(permissions.assertCanWritePlan({ id: 31, permissions: ['view_dossiers'] }, {
      transaction: true, humanReadable: '', confidence: 1,
      operations: [{ operation: 'ACTION', action: 'envoyer_email', entity: 'dossiers', entityId: 91, fields: {}, humanReadable: '' }],
    })).resolves.toBeUndefined();
  });
});
