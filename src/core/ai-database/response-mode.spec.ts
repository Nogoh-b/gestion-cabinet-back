import { describe, it, expect, jest } from '@jest/globals';

import {
  IntentDetectionService,
  parseLightClassification,
} from './intent-detection.service';
import { buildModeChoiceOptions, composeResponseModes, describeResponseMode } from './response-mode';
import type { SourceSignals } from './source-signals';

const neutralSignals: SourceSignals = {
  recordReference: null,
  cabinetAnchor: false,
  followUp: false,
  domainKeyword: false,
  legalMarkers: false,
  writeVerb: false,
  legalKb: null,
};

const llmAnswering = (content: string) => ({ invoke: jest.fn(async () => ({ content })) }) as any;

const service = new IntentDetectionService({
  getAllHandlers: jest.fn(() => []),
  generateGlobalWriteSchema: jest.fn(async () => ''),
} as any);

describe('mode de réponse affiché dans le chat', () => {
  it('nomme le mode comme le menu « / » et dit qui l’a choisi', () => {
    expect(describeResponseMode({ type: 'HELP', reason: 'question sur l’application' }, 'auto')).toEqual({
      code: 'help',
      label: 'Aide',
      origin: 'auto',
      reason: 'question sur l’application',
    });
    expect(describeResponseMode({ type: 'CONVERSATIONAL' }, 'chat')).toMatchObject({
      code: 'chat',
      label: 'Conversation',
      origin: 'manual',
    });
    expect(describeResponseMode({ type: 'KNOWLEDGE' }, 'knowledge')).toMatchObject({
      label: 'Base de connaissance',
      origin: 'manual',
    });
  });

  it('garde l’origine « repli » quand le mode change en cours de route', () => {
    expect(
      describeResponseMode({ type: 'CONVERSATIONAL', origin: 'fallback', reason: 'aucune donnée' }, 'auto'),
    ).toMatchObject({ code: 'chat', origin: 'fallback', reason: 'aucune donnée' });
  });

  it('liste les compétences mobilisées, sans doublon', () => {
    expect(
      describeResponseMode({ type: 'WRITE' }, 'auto', ['Envoyer une facture', 'Envoyer une facture']),
    ).toMatchObject({ code: 'write', skills: ['Envoyer une facture'] });
    expect(describeResponseMode({ type: 'SKILL' }, 'auto', ['Mise en demeure'])).toMatchObject({
      code: 'skill',
      label: 'Compétence',
      origin: 'manual',
      skills: ['Mise en demeure'],
    });
  });

  it('ignore une intention inconnue', () => {
    expect(describeResponseMode({ type: 'UNCERTAIN' }, 'auto')).toBeNull();
  });
});

describe('hésitation du classifieur', () => {
  it.each([
    ['READ', { value: 'READ' }],
    ['READ|CHAT', { value: 'READ', alternative: 'CHAT' }],
    [' help | read ', { value: 'HELP', alternative: 'READ' }],
    ['CHAT ou READ', { value: 'CHAT', alternative: 'READ' }],
    ['READ|READ', { value: 'READ' }],
    // Le texte d'explication n'invente pas de seconde classe.
    ['READ, because the user asks for files', { value: 'READ' }],
  ])('lit « %s »', (raw, expected) => {
    expect(parseLightClassification(raw)).toEqual(expected);
  });

  it('réponse vide ou en prose : illisible, pas une hésitation', () => {
    expect(parseLightClassification('  ')).toBeNull();
    expect(
      parseLightClassification('First, I need to classify the demand. The options are READ, WRITE, HELP, ADVICE, CHAT.'),
    ).toBeNull();
    expect(parseLightClassification('User Safety: safe')).toBeNull();
    // Le choix double vaut sur la première ligne, même suivie d'une explication.
    expect(parseLightClassification('**READ | HELP**\nLa demande peut viser…')).toEqual({ value: 'READ', alternative: 'HELP' });
  });

  it('classifieur en prose sur une question sans indice : le chat demande', async () => {
    const result = await service.detectIntent(
      'note sur la rupture abusive',
      llmAnswering('First, I need to classify the demand: READ, WRITE…'),
      '',
      { signals: neutralSignals, allowModeChoice: true },
    );
    expect(result).toMatchObject({ type: 'UNCERTAIN', candidates: ['CHAT', 'READ'] });
  });

  it('propose le choix du mode quand le classifieur donne deux classes', async () => {
    const result = await service.detectIntent('les frais de justice', llmAnswering('READ|CHAT'), '', {
      signals: neutralSignals,
      allowModeChoice: true,
    });
    expect(result).toMatchObject({ type: 'UNCERTAIN', candidates: ['READ', 'CHAT'] });
  });

  it('sans carte possible (chemin REST), garde la classe la plus probable', async () => {
    const result = await service.detectIntent('les frais de justice', llmAnswering('READ|CHAT'), '', {
      signals: neutralSignals,
    });
    expect(result.type).toBe('READ');
  });

  it('un numéro cité tranche entre données et connaissances', async () => {
    const result = await service.detectIntent('et le délai pour DOS-2026-0001', llmAnswering('CHAT|READ'), '', {
      signals: { ...neutralSignals, recordReference: 'DOS-2026-0001' },
      allowModeChoice: true,
    });
    expect(result).toMatchObject({ type: 'READ', reason: 'numéro cité (DOS-2026-0001)' });
  });

  it('classifieur muet sur une question sans indice : le chat demande', async () => {
    const result = await service.detectIntent('les honoraires', llmAnswering(''), '', {
      signals: neutralSignals,
      allowModeChoice: true,
    });
    expect(result).toMatchObject({ type: 'UNCERTAIN', candidates: ['CHAT', 'READ'] });
  });

  it('classifieur muet sur une question rattachée au cabinet : pas de carte', async () => {
    const result = await service.detectIntent('mes honoraires', llmAnswering(''), '', {
      signals: { ...neutralSignals, cabinetAnchor: true, domainKeyword: true },
      allowModeChoice: true,
    });
    expect(result.type).toBe('READ');
  });

  it('une règle locale donne sa raison', async () => {
    const result = await service.detectIntent('comment creer un client ?', llmAnswering('READ'), '', {
      allowModeChoice: true,
    });
    expect(result).toMatchObject({ type: 'HELP', reason: "question sur l'utilisation de l'application" });
  });
});

describe('carte « Comment dois-je traiter votre demande ? »', () => {
  it('propose les modes dans l’ordre du classifieur, avec leur description', () => {
    expect(buildModeChoiceOptions(['READ', 'CHAT'])).toEqual([
      { mode: 'read', label: 'Lire', description: 'Chercher la réponse dans les données du cabinet' },
      { mode: 'chat', label: 'Conversation', description: 'Répondre avec mes connaissances (droit, culture générale)' },
    ]);
  });

  it('ajoute la base juridique quand elle couvre la question', () => {
    expect(buildModeChoiceOptions(['CHAT', 'HELP'], { knowledgeBase: true }).map((o) => o.mode)).toEqual([
      'chat',
      'help',
      'knowledge',
    ]);
  });

  it('propose le conseil comme mode à part entière', () => {
    expect(buildModeChoiceOptions(['ADVICE', 'READ']).map((o) => o.mode)).toEqual(['advice', 'read']);
  });
});

describe('compétences et demandes enchaînées (classifieur)', () => {
  it.each([
    ['SKILL:whatsapp', { value: 'SKILL', skill: 'whatsapp' }],
    [' skill : mise_en_demeure ', { value: 'SKILL', skill: 'mise_en_demeure' }],
    ['HELP+READ', { value: 'HELP', parts: [{ kind: 'HELP' }, { kind: 'READ' }] }],
    ['READ + SKILL:whatsapp', { value: 'READ', parts: [{ kind: 'READ' }, { kind: 'SKILL', skill: 'whatsapp' }] }],
  ])('lit « %s »', (raw, expected) => {
    expect(parseLightClassification(raw)).toEqual(expected);
  });

  it('« + » dans une explication ne fait pas une demande enchaînée', () => {
    expect(parseLightClassification('CHAT (question générale + salutation)')).toEqual({ value: 'CHAT' });
  });

  it('SKILL retenu seulement pour une compétence candidate', async () => {
    const candidates = [{ code: 'mise_en_demeure', label: 'Mise en demeure', description: 'Lettre' }];
    await expect(
      service.detectIntent('mise en demeure pour M. Kamga', llmAnswering('SKILL:mise_en_demeure'), '', {
        signals: neutralSignals,
        skillCandidates: candidates,
      }),
    ).resolves.toMatchObject({ type: 'SKILL', skill: 'mise_en_demeure' });
    const unknown = await service.detectIntent('mise en demeure pour M. Mbarga', llmAnswering('SKILL:whatsapp'), '', {
      signals: neutralSignals,
      skillCandidates: candidates,
    });
    expect(unknown.type).not.toBe('SKILL');
  });

  it('demande enchaînée retenue seulement quand le chat la sait traiter', async () => {
    const parts = await service.detectIntent('explique les audiences et liste celles de demain', llmAnswering('HELP+READ'), '', {
      signals: neutralSignals,
      allowComposite: true,
    });
    expect(parts).toMatchObject({ type: 'COMPOSITE', parts: [{ kind: 'HELP' }, { kind: 'READ' }] });
    const single = await service.detectIntent('explique les audiences et liste celles du jour', llmAnswering('HELP+READ'), '', {
      signals: neutralSignals,
    });
    expect(single.type).toBe('HELP');
  });

  it('le prompt du classifieur présente les compétences candidates', async () => {
    const llm = llmAnswering('CHAT');
    await service.detectIntent('lettre pour M. Kamga au sujet de sa dette', llm, '', {
      signals: neutralSignals,
      skillCandidates: [{ code: 'mise_en_demeure', label: 'Mise en demeure', description: 'Lettre de mise en demeure' }],
    });
    const prompt = (llm.invoke.mock.calls[0][0] as any)[0].content as string;
    expect(prompt).toContain('- mise_en_demeure : Mise en demeure — Lettre de mise en demeure');
    expect(prompt).toContain('SKILL:<code>');
  });
});

describe('mode d’une compétence et d’une réponse en plusieurs parties', () => {
  it('compétence reconnue dans la demande : origine « auto »', () => {
    expect(describeResponseMode({ type: 'SKILL', origin: 'auto' }, 'auto', ['Préparer un WhatsApp'])).toMatchObject({
      code: 'skill',
      origin: 'auto',
    });
  });

  it('réponse en plusieurs parties : libellé « Aide + Lire » et une partie par mode', () => {
    const help = describeResponseMode({ type: 'HELP' }, 'auto')!;
    const skill = describeResponseMode({ type: 'SKILL', origin: 'auto' }, 'auto', ['Préparer un WhatsApp'])!;
    const composed = composeResponseModes([help, skill])!;
    expect(composed.label).toBe('Aide + Compétence');
    expect(composed.parts).toHaveLength(2);
    expect(composed.skills).toEqual(['Préparer un WhatsApp']);
    expect(composeResponseModes([help])).toBe(help);
  });
});
