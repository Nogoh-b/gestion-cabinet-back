/// <reference types="jest" />
// Compétences fusionnées (21/10/2026) : « courrier », « mise_en_demeure »,
// « document_modele » et « creer_modele » passent par « Créer / modifier un
// document ». Les boutons et messages enregistrés avec ces codes restent valides.
import { AiSkillRegistry } from './ai-skill.registry';
import { AiSkillService } from './ai-skill.service';
import type { AiSkillHandler } from './ai-skill.types';

function setup() {
  const run = jest.fn(async (ctx: any) => ({ type: 'clarify' as const, markdown: JSON.stringify(ctx.params) }));
  const handler: AiSkillHandler = {
    definition: {
      code: 'rediger_document',
      label: 'Créer / modifier un document',
      description: '',
      icon: 'file-pen',
      category: 'documents',
      placeholder: '',
      aliases: [
        { code: 'courrier', params: { templateCode: 'general_courrier' } },
        { code: 'document_modele' },
      ],
    },
    run,
  };
  const registry = new AiSkillRegistry();
  registry.register(handler);
  const service = new AiSkillService(
    registry,
    { missingPermissions: jest.fn(async () => []) } as any,
    { getCabinetPlan: jest.fn(async () => null) } as any,
  );
  return { registry, service, run };
}

describe('anciens codes de compétences', () => {
  it('mènent à la compétence fusionnée, absents du menu', async () => {
    const { registry, service } = setup();
    expect(registry.get('courrier')?.definition.code).toBe('rediger_document');
    expect(registry.get('Document_Modele')?.definition.code).toBe('rediger_document');
    expect(registry.all().map((item) => item.definition.code)).toEqual(['rediger_document']);
    expect(service.canonicalCode('courrier')).toBe('rediger_document');
  });

  it('ajoutent leur préremplissage, sans écraser les paramètres reçus', async () => {
    const { service, run } = setup();
    const ctx: any = { user: { id: 1 }, params: { bodyContent: 'Texte' } };
    await service.run('courrier', ctx);
    expect(run.mock.calls[0][0].params).toEqual({ templateCode: 'general_courrier', bodyContent: 'Texte' });

    await service.run('courrier', { ...ctx, params: { templateCode: 'autre' } });
    expect(run.mock.calls[1][0].params.templateCode).toBe('autre');

    await service.run('rediger_document', ctx);
    expect(run.mock.calls[2][0].params).toEqual({ bodyContent: 'Texte' });
  });
});
