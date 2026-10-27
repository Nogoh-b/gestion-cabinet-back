/// <reference types="jest" />
// Rejeu des conversations signalées (20/10/2026), LLM et base simulés :
// - « quel est mon role dans le cabinet » / « mon plan d'abonement » : réponse
//   tirée du profil, sans demande de précision ;
// - « je veut preparer un whatsapp » : compétence lancée en mode auto ;
// - réponse à « mentionnez le dossier avec @ » : la compétence reprend ;
// - plusieurs demandes dans une question : une réponse en plusieurs parties.
import { AiDatabaseService } from './ai-database.service';
import { ConversationManagerService } from './conversation-manager.service';
import { IntentDetectionService } from './intent-detection.service';
import type { UserProfileSnapshot } from './user-profile';

const PROFILE: UserProfileSnapshot = {
  userId: 12,
  name: 'Awa Ngono',
  email: 'awa@cabinet.cm',
  position: 'juriste',
  roleName: 'Juriste',
  isAdmin: false,
  capabilities: [{ label: 'Dossiers', actions: ['consulter les dossiers'] }],
  denied: ['Paie'],
  cabinet: { name: 'Cabinet Kaby', code: 'm05sdnfv' },
  plan: { name: 'Pro', code: 'pro', included: ["l'assistant IA"], excluded: ['la paie'] },
  subscription: null,
  quotas: [],
  ai: null,
  canSeeBilling: false,
  skills: 2,
};

const WHATSAPP = {
  code: 'whatsapp',
  label: 'Préparer un WhatsApp',
  description: 'Message WhatsApp au client',
  icon: 'message-circle',
  category: 'communication',
  categoryLabel: 'Communication',
  targets: ['client', 'dossier'],
  targetRequired: true,
  placeholder: '',
  examples: [],
  keywords: ['whatsapp', 'sms', 'message'],
  autoTriggers: ['whatsapp', 'sms', 'texto'],
};

const DOSSIER_MENTION = { type: 'dossier', label: '#DOS-2026-0038 — Émilie LEFÈVRE', id: 90, data: { id: 90 } };

function conversationManager(lastMetadata: Record<string, any> | null = null) {
  const manager: any = new ConversationManagerService({} as any, {} as any, {} as any);
  manager.saved = [] as Array<{ role: string; content: string; metadata?: any }>;
  manager.createConversation = jest.fn(async () => ({ id: 'conv-1' }));
  manager.getLastAssistantMetadata = jest.fn(async () => lastMetadata);
  manager.addMessage = jest.fn(async (_id: string, role: string, content: string, _r: any, _x: any, _refs: any, metadata: any) => {
    manager.saved.push({ role, content, metadata });
    return { id: manager.saved.length };
  });
  manager.saveQueuedDocuments = jest.fn(async () => undefined);
  manager.updateTitleFromFirstUserMessage = jest.fn(async () => undefined);
  manager.attachConversationResource = jest.fn(async () => undefined);
  return manager;
}

function buildService(options: { references?: any[]; lastMetadata?: Record<string, any> | null; skillOutcome?: any } = {}) {
  const service: any = Object.create(AiDatabaseService.prototype);
  service.logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
  service.configureRequestModel = () => ({ mode: 'fast' });
  service.getRequestModelName = () => 'test';
  service.getRequestModel = () => ({});
  service.markMetric = jest.fn();
  // Contexte de la requête (profil chargé, faits de la fiche) : un seul objet pour le test.
  const store: Record<string, any> = {};
  service.metricsStorage = { getStore: () => store };
  service.tryConsumePendingEntityIdClarification = () => null;
  service.buildRequestContext = async (dto: any) => ({
    enrichedQuestion: dto.question,
    intentQuestion: dto.question,
    documentContext: [],
    referenced: options.references ?? [],
  });
  service.aiPermissionService = {
    getAccessProfile: jest.fn(async () => ({ isAdmin: false, roleName: 'Juriste', permissions: new Map([['view_dossiers', 'Consulter les dossiers']]) })),
    assertCanWritePlan: jest.fn(),
  };
  service.userProfiles = { snapshot: jest.fn(async () => PROFILE) };
  service.conversationManager = conversationManager(options.lastMetadata ?? null);
  service.intentDetectionService = new IntentDetectionService({} as any);
  jest.spyOn(service.intentDetectionService, 'detectIntent').mockResolvedValue({ type: 'READ', requiresConfirmation: false });
  const skillContexts: any[] = [];
  service.skills = {
    catalog: jest.fn(async () => [WHATSAPP]),
    label: (code: string) => (code === 'whatsapp' ? WHATSAPP.label : code),
    targets: (code: string) => (code === 'whatsapp' ? WHATSAPP.targets : []),
    has: (code: string) => code === 'whatsapp',
    recordFacts: jest.fn(async () => ''),
    run: jest.fn(async (_code: string, ctx: any) => {
      skillContexts.push(ctx);
      return options.skillOutcome ?? {
        type: 'message_draft',
        markdown: 'Voici le message WhatsApp.',
        draft: { channel: 'whatsapp', recipientName: 'Émilie Lefèvre', phone: '+237677000000', text: 'Bonjour…' },
      };
    }),
  };
  service.skillContexts = skillContexts;
  return service;
}

async function ask(service: any, dto: Record<string, any>, options: { allowErrors?: boolean } = {}) {
  const events: Array<[string, any]> = [];
  await service.analyzeQuestionStreamInternal({ intentMode: 'auto', ...dto }, { id: 12, tenantId: 25 }, undefined, (event: string, data: any) => events.push([event, data]));
  if (!options.allowErrors) expect(events.filter(([event]) => event === 'error')).toEqual([]);
  return events;
}

const of = (events: Array<[string, any]>, name: string) => events.filter(([event]) => event === name).map(([, data]) => data);

describe('rejeu : questions sur le compte', () => {
  it.each([
    ['quel est mon role dans le cabinet', '**Juriste**'],
    ["quels est mon plan d'abonement actuel", 'plan **Pro**'],
  ])('« %s » : réponse du profil, sans demande de précision', async (question, expected) => {
    const service = buildService();
    const events = await ask(service, { question });
    const result = of(events, 'result')[0];
    expect(result.analysis).toContain(expected);
    expect(result.requiresClarification).toBeFalsy();
    expect(of(events, 'intent')[0]).toEqual({ type: 'HELP', reason: 'question sur votre compte' });
    expect(service.intentDetectionService.detectIntent).not.toHaveBeenCalled();
  });
});

describe('rejeu : compétences en mode auto', () => {
  it('« je veut preparer un whatsapp » lance la compétence WhatsApp (badge « auto »)', async () => {
    const service = buildService({ references: [DOSSIER_MENTION] });
    const events = await ask(service, { question: 'je veut preparer un whatsapp' });
    expect(service.skills.run).toHaveBeenCalledWith('whatsapp', expect.anything());
    expect(of(events, 'intent')[0]).toMatchObject({ type: 'SKILL', skill: 'whatsapp', origin: 'auto' });
    expect(of(events, 'result')[0].messageDraft).toMatchObject({ channel: 'whatsapp' });
    expect(service.intentDetectionService.detectIntent).not.toHaveBeenCalled();
  });

  it('cible manquante : la compétence reste en attente (skillPending)', async () => {
    const service = buildService({
      skillOutcome: { type: 'clarify', markdown: '❓ Pour « Préparer un WhatsApp », mentionnez un client ou un dossier avec **@**.' },
    });
    const events = await ask(service, { question: 'je veut preparer un whatsapp' });
    const result = of(events, 'result')[0];
    expect(result.skillPending).toMatchObject({ code: 'whatsapp', question: 'je veut preparer un whatsapp' });
    const saved = service.conversationManager.saved.find((message: any) => message.role === 'assistant');
    expect(saved.metadata.skillPending.code).toBe('whatsapp');
  });

  it('le chat renvoie la compétence avec la demande initiale : la consigne reste celle du départ', async () => {
    const service = buildService({ references: [DOSSIER_MENTION] });
    await ask(service, {
      question: '#DOS-2026-0038 — Émilie LEFÈVRE voila le dossier il faut faire un recapitulatif des actions menée',
      skill: 'whatsapp',
      skillParams: JSON.stringify({ previousQuestion: 'je veut preparer un whatsapp' }),
    });
    const ctx = service.skillContexts[0];
    expect(ctx.question).toContain('je veut preparer un whatsapp');
    expect(ctx.question).toContain('Précision apportée : #DOS-2026-0038');
    expect(ctx.params.previousQuestion).toBeUndefined();
    expect(ctx.userContext).toContain("Profil d'accès : Juriste");
  });

  it('sans le chip (page rechargée) : la nouvelle mention reprend la compétence en attente', async () => {
    const service = buildService({
      references: [DOSSIER_MENTION],
      lastMetadata: { skillPending: { code: 'whatsapp', label: 'Préparer un WhatsApp', question: 'je veut preparer un whatsapp', at: new Date().toISOString() } },
    });
    const events = await ask(service, {
      conversationId: 'conv-1',
      question: '#DOS-2026-0038 — Émilie LEFÈVRE voila le dossier il faut faire un recapitulatif des actions menée',
      historyOverride: JSON.stringify([
        { role: 'user', content: 'je veut preparer un whatsapp' },
        { role: 'assistant', content: '❓ mentionnez un client ou un dossier avec @' },
      ]),
    });
    expect(of(events, 'intent')[0]).toMatchObject({ type: 'SKILL', skill: 'whatsapp', origin: 'auto' });
    expect(service.skillContexts[0].question).toContain('Précision apportée');
  });

  it('une compétence en attente trop ancienne ne reprend pas', async () => {
    const service = buildService({
      references: [DOSSIER_MENTION],
      lastMetadata: { skillPending: { code: 'whatsapp', question: 'je veut preparer un whatsapp', at: '2020-01-01T00:00:00.000Z' } },
    });
    // La demande suit alors le parcours normal (lecture, non simulée ici).
    await ask(service, { conversationId: 'conv-1', question: 'quels sont les délais de ce dossier ?' }, { allowErrors: true });
    expect(service.skills.run).not.toHaveBeenCalled();
  });
});

describe('rejeu : plusieurs demandes dans une même question', () => {
  it('profil + lecture : une réponse en deux parties, une seule question et une seule réponse enregistrées', async () => {
    const service = buildService();
    const original = service.analyzeQuestionStreamInternal.bind(service);
    jest.spyOn(service, 'analyzeQuestionStreamInternal').mockImplementation(async (dto: any, user: any, files: any, send: any) => {
      if (dto.intentMode !== 'read') return original(dto, user, files, send);
      send('intent', { type: 'READ' });
      send('token', { text: 'Vous avez 2 dossiers en cours.' });
      send('result', { success: true, analysis: 'Vous avez 2 dossiers en cours.', results: [{ dossier: 'DOS-1' }, { dossier: 'DOS-2' }], rowCount: 2 });
    });
    const events: Array<[string, any]> = [];
    await service.analyzeQuestionStreamInternal(
      { intentMode: 'auto', question: 'quel est mon rôle et liste mes dossiers en cours' },
      { id: 12, tenantId: 25 },
      undefined,
      (event: string, data: any) => events.push([event, data]),
    );
    const result = of(events, 'result')[0];
    expect(result.analysis).toContain('**Juriste**');
    expect(result.analysis).toContain('---');
    expect(result.analysis).toContain('Vous avez 2 dossiers en cours.');
    expect(result.rowCount).toBe(2);
    expect(result.responseMode.parts.map((part: any) => part.code)).toEqual(['help', 'read']);
    expect(result.responseMode.label).toBe('Aide + Lire');
    const saved = service.conversationManager.saved;
    expect(saved.filter((message: any) => message.role === 'user')).toHaveLength(1);
    expect(saved.filter((message: any) => message.role === 'assistant')).toHaveLength(1);
    expect(saved.find((message: any) => message.role === 'assistant').metadata.composedSteps).toHaveLength(2);
  });

  it('lecture puis compétence : le WhatsApp reçoit le récapitulatif lu juste avant', async () => {
    const service = buildService({ references: [DOSSIER_MENTION] });
    const original = service.analyzeQuestionStreamInternal.bind(service);
    jest.spyOn(service, 'analyzeQuestionStreamInternal').mockImplementation(async (dto: any, user: any, files: any, send: any) => {
      if (dto.intentMode !== 'read') return original(dto, user, files, send);
      send('intent', { type: 'READ' });
      send('result', { success: true, analysis: 'Actions menées : assignation signifiée le 02/10, audience renvoyée au 12/11.' });
    });
    const events: Array<[string, any]> = [];
    await service.analyzeQuestionStreamInternal(
      { intentMode: 'auto', question: 'liste les actions menées sur le dossier DOS-2026-0038 puis prépare un whatsapp au client' },
      { id: 12, tenantId: 25 },
      undefined,
      (event: string, data: any) => events.push([event, data]),
    );
    const ctx = service.skillContexts[0];
    expect(ctx).toBeDefined();
    const lastAnswer = [...ctx.history].reverse().find((message: any) => message.role === 'assistant');
    expect(lastAnswer.content).toContain('assignation signifiée');
    const result = of(events, 'result')[0];
    expect(result.messageDraft).toMatchObject({ channel: 'whatsapp' });
    expect(result.analysis).toContain('Actions menées');
    expect(result.analysis).toContain('Voici le message WhatsApp.');
  });
});
