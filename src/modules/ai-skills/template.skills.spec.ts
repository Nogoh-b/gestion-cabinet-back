/// <reference types="jest" />
import type { AiSkillContext } from 'src/core/ai-database/skills/ai-skill.types';
import { ModelesSkill } from './template.skills';

const pdfTemplates = [
  { id: 1, code: 'facture_standard', name: 'Facture standard', entity_type: 'facture', variant: 'standard', body_html: '<p>Total {{numero}}</p>', variables: '["numero"]', is_active: true, is_system: false, header_block_id: 10 },
  { id: 2, code: 'dossier_synthese', name: 'Synthèse dossier', entity_type: 'dossier', variant: 'standard', body_html: '<p>Dossier</p>', variables: null, is_active: true, is_system: false },
];

const mailTemplates = [
  { id: 5, code: 'dossier_created_client', name: 'Dossier créé', category: 'dossier', audience: 'client', subject: 'Votre dossier {{dossierNumber}}', body_html: '<p>Bonjour</p>', variables: null, is_active: true, is_system: false },
];

const blocks = [
  { id: 10, code: 'pdf_header_defaut', name: 'En-tête PDF', channel: 'pdf', kind: 'header', body_html: '<p>Cabinet</p>', variables: null, is_default: true, is_active: true, is_system: true },
];

function servicesMock() {
  return {
    pdf: {
      findAll: jest.fn(async () => pdfTemplates),
      findByCode: jest.fn(async (code: string) => pdfTemplates.find((item) => item.code === code) ?? null),
      findOne: jest.fn(async (id: number) => pdfTemplates.find((item) => item.id === id) ?? null),
      create: jest.fn(async (dto: any) => ({ id: 99, ...dto })),
      update: jest.fn(async (id: number, dto: any) => ({ ...pdfTemplates.find((item) => item.id === id), ...dto })),
    },
    mails: {
      findAll: jest.fn(async () => mailTemplates),
      findByCode: jest.fn(async (code: string) => mailTemplates.find((item) => item.code === code) ?? null),
      findOne: jest.fn(async (id: number) => mailTemplates.find((item) => item.id === id) ?? null),
      create: jest.fn(async (dto: any) => ({ id: 98, ...dto })),
      update: jest.fn(async (id: number, dto: any) => ({ ...mailTemplates.find((item) => item.id === id), ...dto })),
    },
    blocks: {
      findAll: jest.fn(async () => blocks),
      findByCode: jest.fn(async (code: string) => blocks.find((item) => item.code === code) ?? null),
      findOne: jest.fn(async (id: number) => blocks.find((item) => item.id === id) ?? null),
      create: jest.fn(async (dto: any) => ({ id: 97, ...dto })),
      update: jest.fn(async (id: number, dto: any) => ({ ...blocks.find((item) => item.id === id), ...dto })),
    },
  };
}

const ctx = (extra: Partial<AiSkillContext> = {}): AiSkillContext => ({
  question: 'liste les modèles',
  references: [],
  documents: [],
  params: {},
  user: { id: 31 },
  userId: '31',
  history: [],
  llm: { complete: jest.fn(), stream: jest.fn(), draft: jest.fn() },
  status: jest.fn(),
  readDocuments: jest.fn(async () => []),
  legalSources: jest.fn(async () => ''),
  ...extra,
});

const skillOf = (services: ReturnType<typeof servicesMock>, permissions?: any): ModelesSkill =>
  new ModelesSkill(services.pdf as any, services.mails as any, services.blocks as any, permissions);

describe('ModelesSkill (modèles mails, PDF et blocs)', () => {
  it('liste les modèles PDF par leur nom, sans codes', async () => {
    const services = servicesMock();
    const outcome = await skillOf(services).run(ctx({ question: 'liste les modèles de documents PDF' }));
    expect(outcome.type).toBe('answer');
    if (outcome.type !== 'answer') return;
    expect(outcome.markdown).toContain('Facture standard');
    expect(outcome.markdown).toContain('Synthèse dossier');
    expect(outcome.markdown).not.toContain('facture_standard');
    expect(services.pdf.findAll).toHaveBeenCalled();
  });

  it('refuse la lecture sans le droit de visualisation', async () => {
    const services = servicesMock();
    const permissions = { missingPermissions: jest.fn(async () => ['view_pdf_templates']) };
    const outcome = await skillOf(services, permissions).run(
      ctx({ question: 'lis le modèle facture_standard' }),
    );
    expect(outcome.type).toBe('clarify');
    expect(services.pdf.findAll).not.toHaveBeenCalled();
  });

  it('lit un modèle en clair : ni code, ni variables, ni blocs', async () => {
    const services = servicesMock();
    const outcome = await skillOf(services).run(ctx({ question: 'lis le modèle « facture_standard »' }));
    expect(outcome.type).toBe('answer');
    if (outcome.type !== 'answer') return;
    expect(outcome.markdown).toContain('Facture standard');
    expect(outcome.markdown).toContain('Total [numéro]');
    for (const technical of ['facture_standard', 'pdf_header_defaut', 'Variables', '{{', '```']) expect(outcome.markdown).not.toContain(technical);
    expect(outcome.followUps?.[0]).toMatchObject({ skill: 'modeles', params: { action: 'update', code: 'facture_standard' } });
  });

  it('propose des choix quand aucun modèle ne correspond à tous les mots', async () => {
    const services = servicesMock();
    const outcome = await skillOf(services).run(ctx({ question: 'lis le modèle « dossier facture » de document' }));
    expect(outcome.type).toBe('clarify');
    if (outcome.type !== 'clarify') return;
    expect(outcome.markdown).toContain('s’en rapprochent');
    // Les deux modèles, plus de quoi ouvrir la liste complète.
    expect(outcome.followUps).toHaveLength(3);
    expect(outcome.followUps?.[2]).toMatchObject({ label: 'Voir tous les modèles', params: { action: 'list' } });
  });

  it('lit un modèle par son NOM seul, sans code', async () => {
    const services = servicesMock();
    const outcome = await skillOf(services).run(ctx({ question: 'montre-moi le modèle Synthèse dossier' }));
    expect(outcome.type).toBe('answer');
    if (outcome.type !== 'answer') return;
    expect(outcome.markdown).toContain('## Synthèse dossier');
  });

  it('un nom approximatif (faute de frappe) retrouve quand même le modèle', async () => {
    const services = servicesMock();
    const outcome = await skillOf(services).run(ctx({ question: 'lis le modèle Sythèse dossiers' }));
    expect(outcome.type).toBe('answer');
    if (outcome.type !== 'answer') return;
    expect(outcome.markdown).toContain('## Synthèse dossier');
  });

  it('modification d’un nom introuvable : liste des modèles proches, avec un moyen d’en choisir un autre', async () => {
    const services = servicesMock();
    const outcome = await skillOf(services).run(ctx({
      question: 'modifie le modèle de document Facture annuelle',
      params: { family: 'pdf' },
    }));
    expect(outcome.type).toBe('clarify');
    if (outcome.type !== 'clarify') return;
    expect(outcome.markdown).toContain('s’en rapprochent');
    expect(outcome.followUps?.[0]).toMatchObject({ label: 'Facture standard', params: { action: 'update', family: 'pdf', code: 'facture_standard' } });
    expect(outcome.followUps?.at(-1)).toMatchObject({ label: 'Voir tous les modèles' });
    expect(outcome.markdown).not.toContain('facture_standard');
    expect(services.pdf.update).not.toHaveBeenCalled();
  });

  it('propose un modèle de mail à créer dans la carte, sans le créer', async () => {
    const services = servicesMock();
    const outcome = await skillOf(services).run(ctx({
      question: 'crée un modèle de mail',
      params: {
        family: 'mail', code: 'relance_test', name: 'Relance test',
        subject: 'Relance', body_html: '<p>Payez</p>',
      },
    }));
    expect(outcome.type).toBe('clarify');
    if (outcome.type !== 'clarify') return;
    expect(outcome.templateDraft).toMatchObject({ mode: 'create', id: null, code: 'relance_test', name: 'Relance test', subject: 'Relance', body_html: '<p>Payez</p>' });
    expect(outcome.pendingQuestion).toBe('crée le modèle de mail relance_test');
    expect(services.mails.create).not.toHaveBeenCalled();
  });

  it('demande les champs manquants sans contenu déductible', async () => {
    const services = servicesMock();
    const outcome = await skillOf(services).run(ctx({ question: 'crée un modèle', params: { family: 'bloc' } }));
    expect(outcome.type).toBe('clarify');
    expect(services.blocks.create).not.toHaveBeenCalled();
  });

  it('confie la création d’un modèle de document au studio (un seul parcours)', async () => {
    const services = servicesMock();
    const outcome = await skillOf(services).run(ctx({ question: 'crée un modèle de convocation', params: { family: 'pdf' } }));
    expect(outcome).toEqual({ type: 'handoff', skill: 'rediger_document', params: { createTemplate: true } });
    expect(services.pdf.create).not.toHaveBeenCalled();
  });

  it('modifie le modèle désigné, même quand la demande commence par « ajoute »', async () => {
    const services = servicesMock();
    const outcome = await skillOf(services).run(ctx({ question: 'ajoute une phrase de politesse au modèle Facture standard' }));
    expect(outcome.type).toBe('clarify');
    expect(services.pdf.create).not.toHaveBeenCalled();
    expect(services.mails.create).not.toHaveBeenCalled();
  });

  it('marque chaque modèle proposé : mail ou document', async () => {
    const services = servicesMock();
    const outcome = await skillOf(services).run(ctx({ question: 'lis le modèle zzz introuvable', params: { family: 'all', action: 'read' } }));
    const templates = ((outcome as any).followUps as any[] ?? []).filter((item) => item.params?.code);
    expect(templates.length).toBeGreaterThan(0);
    for (const item of templates) expect(['mail', 'document', 'bloc']).toContain(item.badge);
    expect((outcome as any).followUps?.at(-1)).toMatchObject({ label: 'Voir tous les modèles', params: { action: 'list', family: 'all' } });
  });

  it('suit les fichiers joints pour retoucher un modèle et le dit', async () => {
    const services = servicesMock();
    const complete = jest.fn().mockResolvedValue('{"body_html":"<p>Total {{numero}}</p><p>Clause reprise.</p>"}');
    const outcome = await skillOf(services).run(ctx({
      question: 'modifie le modèle Facture standard : reprends la clause du fichier joint',
      documents: [{ name: 'clauses.docx', content: 'Article 3 — Clause reprise.' }],
      llm: { complete },
    } as any));
    expect(complete.mock.calls[0][0]).toContain('Fichier « clauses.docx »');
    expect(outcome.type).toBe('clarify');
    expect((outcome as any).markdown).toContain('📎 Fichiers utilisés : « clauses.docx »');
  });

  it('« aucun » retire l’en-tête (0), sans revenir au bloc par défaut', async () => {
    const services = servicesMock();
    const complete = jest.fn().mockResolvedValue('{"header_block":"aucun"}');
    const outcome = await skillOf(services).run(ctx({ question: 'modifie le modèle Facture standard : retire l’en-tête', llm: { complete } } as any));
    expect((outcome as any).templateDraft).toMatchObject({ header_block_id: 0, changes: { header_block_id: 0 }, changeLabels: ['l’en-tête : aucun'] });
  });

  it('propose la modification d’un bloc dans la carte, sans l’enregistrer ni toucher au code', async () => {
    const services = servicesMock();
    const outcome = await skillOf(services).run(ctx({
      question: 'modifie le bloc pdf_header_defaut',
      params: { family: 'bloc', code: 'pdf_header_defaut', body_html: '<p>Nouveau</p>' },
    }));
    expect(outcome.type).toBe('clarify');
    if (outcome.type !== 'clarify') return;
    expect(outcome.templateDraft).toMatchObject({ family: 'bloc', id: 10, code: 'pdf_header_defaut', body_html: '<p>Nouveau</p>', channel: 'pdf', kind: 'header' });
    expect(outcome.templateDraft?.original.body_html).toBe('<p>Cabinet</p>');
    expect(services.blocks.update).not.toHaveBeenCalled();
  });

  it('modèle de document nommé sans consigne : la carte, sans « Texte actuel »', async () => {
    const services = servicesMock();
    const outcome = await skillOf(services).run(ctx({ question: 'modifie le modèle synthèse dossier' }));
    expect(outcome.type).toBe('clarify');
    if (outcome.type !== 'clarify') return;
    expect(outcome.markdown).not.toContain('Texte actuel');
    expect(outcome.templateDraft).toMatchObject({ family: 'pdf', id: 2, body_html: '<p>Dossier</p>' });
    expect(outcome.pendingQuestion).toContain('dossier_synthese');
  });

  it('modèle de document retouché (« plus long ») : nouvelle version dans la carte, rien d’enregistré', async () => {
    const services = servicesMock();
    const llm = { complete: jest.fn(async () => JSON.stringify({ body_html: '<p>Total {{numero}}</p><p>Détail des prestations.</p>' })), stream: jest.fn(), draft: jest.fn() };
    const outcome = await skillOf(services).run(ctx({
      question: 'modifie le modèle de document facture_standard\nPrécision apportée : rends le texte plus long et plus détaillé',
      llm: llm as any,
    }));
    expect(outcome.type).toBe('clarify');
    if (outcome.type !== 'clarify') return;
    expect(outcome.templateDraft).toMatchObject({ family: 'pdf', id: 1, body_html: '<p>Total {{numero}}</p><p>Détail des prestations.</p>' });
    expect(outcome.markdown).toContain('le texte');
    expect(services.pdf.update).not.toHaveBeenCalled();
  });

  it('un simple renommage ou une désactivation passe aussi par la carte', async () => {
    const services = servicesMock();
    const llm = { complete: jest.fn(async () => JSON.stringify({ name: 'Facture détaillée', is_active: 'false' })), stream: jest.fn(), draft: jest.fn() };
    const outcome = await skillOf(services).run(ctx({
      question: 'renomme le modèle Facture standard en Facture détaillée et désactive-le',
      llm: llm as any,
    }));
    expect(outcome.type).toBe('clarify');
    if (outcome.type !== 'clarify') return;
    expect(outcome.templateDraft).toMatchObject({ family: 'pdf', name: 'Facture détaillée', changes: { is_active: false }, changeLabels: ['désactivé'] });
    expect(outcome.templateDraft?.original.name).toBe('Facture standard');
    expect(services.pdf.update).not.toHaveBeenCalled();
  });

  it('nom cité entre « » suivi de la consigne, sans type : retrouve le modèle sans demander mail / PDF / bloc', async () => {
    const services = servicesMock();
    services.pdf.findAll.mockResolvedValue([
      ...pdfTemplates,
      { id: 3, code: 'audience_compte_rendu', name: 'Audience — Compte-rendu', entity_type: 'audience', body_html: '<p>Compte rendu</p>', variables: null, is_active: true, is_system: true },
      { id: 4, code: 'audience_avis_client', name: 'Audience — Avis au client', entity_type: 'audience', body_html: '<p>Avis</p>', variables: null, is_active: true, is_system: true },
    ] as any);
    const llm = { complete: jest.fn(async () => JSON.stringify({ body_html: '<p>Compte rendu</p><p>Bien cordialement.</p>' })), stream: jest.fn(), draft: jest.fn() };
    const outcome = await skillOf(services).run(ctx({
      question: 'Modifier le modèle « Audience — Compte-rendu » ajoute une phrase de politesse à la fin',
      llm: llm as any,
    }));
    expect(outcome.type).toBe('clarify');
    if (outcome.type !== 'clarify') return;
    expect(outcome.markdown).not.toContain('modèle de mail');
    expect(outcome.templateDraft).toMatchObject({ family: 'pdf', id: 3, body_html: '<p>Compte rendu</p><p>Bien cordialement.</p>' });
  });

  it('« désactive le modèle X » : la carte propose la désactivation, sans appel à l’IA', async () => {
    const services = servicesMock();
    services.pdf.findAll.mockResolvedValue([
      ...pdfTemplates,
      { id: 3, code: 'audience_pv', name: 'Audience — Compte-rendu', entity_type: 'audience', body_html: '<p>Compte rendu</p>', variables: null, is_active: 1, is_system: true },
    ] as any);
    const llm = { complete: jest.fn(), stream: jest.fn(), draft: jest.fn() };
    const outcome = await skillOf(services).run(ctx({ question: 'désactive le modèle Audience — Compte-rendu', llm: llm as any }));
    expect(outcome.type).toBe('clarify');
    if (outcome.type !== 'clarify') return;
    expect(outcome.templateDraft).toMatchObject({ family: 'pdf', id: 3, changes: { is_active: false }, changeLabels: ['désactivé'] });
    expect(outcome.markdown).toContain('désactivé');
    expect(llm.complete).not.toHaveBeenCalled();
    expect(services.pdf.update).not.toHaveBeenCalled();
  });

  it('« désactive » un modèle déjà désactivé : rien à changer', async () => {
    const services = servicesMock();
    services.pdf.findAll.mockResolvedValue([
      { id: 3, code: 'audience_pv', name: 'Audience — Compte-rendu', entity_type: 'audience', body_html: '<p>Compte rendu</p>', variables: null, is_active: 0, is_system: true },
    ] as any);
    const outcome = await skillOf(services).run(ctx({ question: 'désactive le modèle Audience — Compte-rendu' }));
    expect(outcome.type).toBe('clarify');
    if (outcome.type !== 'clarify') return;
    expect(outcome.markdown).toContain('déjà désactivé');
    expect(outcome.templateDraft).toBeUndefined();
  });

  it('« modifie le pied de page PDF : ajoute le RCCM » : la carte du bloc de pied de page PDF', async () => {
    const services = servicesMock();
    services.blocks.findAll.mockResolvedValue([
      ...blocks,
      { id: 11, code: 'pdf_footer_defaut', name: 'Pied de page PDF par défaut', channel: 'pdf', kind: 'footer', body_html: '<p>{{cabinetName}}</p>', variables: null, is_default: true, is_active: true, is_system: true },
      { id: 12, code: 'mail_footer_defaut', name: 'Pied de page mail par défaut', channel: 'mail', kind: 'footer', body_html: '<p>Mail</p>', variables: null, is_default: true, is_active: true, is_system: true },
    ] as any);
    const llm = { complete: jest.fn(async () => JSON.stringify({ body_html: '<p>{{cabinetName}} — RCCM {{cabinetRccm}}</p>' })), stream: jest.fn(), draft: jest.fn() };
    const outcome = await skillOf(services).run(ctx({ question: 'modifie le pied de page PDF : ajoute le numéro RCCM', llm: llm as any }));
    expect(outcome.type).toBe('clarify');
    if (outcome.type !== 'clarify') return;
    expect(outcome.templateDraft).toMatchObject({ family: 'bloc', id: 11, kind: 'footer', channel: 'pdf', body_html: '<p>{{cabinetName}} — RCCM {{cabinetRccm}}</p>' });
    expect(services.blocks.update).not.toHaveBeenCalled();
  });

  it('nom repris sans guillemets ni deux-points, suivi de la consigne : retrouve le modèle', async () => {
    const services = servicesMock();
    services.pdf.findAll.mockResolvedValue([
      ...pdfTemplates,
      { id: 3, code: 'audience_compte_rendu', name: 'Audience — Compte-rendu', entity_type: 'audience', body_html: '<p>Compte rendu</p>', variables: null, is_active: true, is_system: true },
      { id: 4, code: 'audience_avis_client', name: 'Audience — Avis au client', entity_type: 'audience', body_html: '<p>Avis</p>', variables: null, is_active: true, is_system: true },
    ] as any);
    const llm = { complete: jest.fn(async () => JSON.stringify({ body_html: '<p>Compte rendu</p><p>Bien cordialement.</p>' })), stream: jest.fn(), draft: jest.fn() };
    const outcome = await skillOf(services).run(ctx({
      question: 'modifie le modèle audience compte rendu ajoute une phrase de politesse',
      llm: llm as any,
    }));
    expect(outcome.type).toBe('clarify');
    if (outcome.type !== 'clarify') return;
    expect(outcome.templateDraft).toMatchObject({ id: 3 });
  });

  it('retouche la carte d’un modèle de document (revise) avec sa famille', async () => {
    const services = servicesMock();
    const llm = { complete: jest.fn(async () => JSON.stringify({ title: 'FACTURE' })), stream: jest.fn(), draft: jest.fn() };
    const outcome = await skillOf(services).run(ctx({
      question: 'mets le titre en majuscules',
      params: { action: 'update', code: 'facture_standard', revise: { family: 'pdf', draftCode: 'facture_standard', name: 'Facture', title: 'Facture', body_html: '<p>Version de la carte {{numero}}</p>', changes: { orientation: 'landscape' } } },
      llm: llm as any,
    }));
    expect(outcome.type).toBe('clarify');
    if (outcome.type !== 'clarify') return;
    expect(outcome.templateDraft).toMatchObject({
      family: 'pdf', title: 'FACTURE', name: 'Facture', body_html: '<p>Version de la carte {{numero}}</p>',
      orientation: 'landscape', changes: { orientation: 'landscape' },
    });
    expect(String((llm.complete.mock.calls as any[])[0][0])).toContain('Version de la carte');
  });

  it('retrouve un modèle de mail par son nom et montre son contenu sans consigne', async () => {
    const services = servicesMock();
    services.mails.findAll.mockResolvedValueOnce([
      ...mailTemplates,
      { id: 6, code: 'account_activation', name: 'Activation de compte', category: 'auth', audience: 'collaborator', subject: 'Activez votre compte', body_html: '<p>Activer</p>', variables: null, is_active: true, is_system: true },
      { id: 7, code: 'account_opening', name: 'Ouverture de compte', category: 'auth', audience: 'both', subject: 'Votre accès', body_html: '<p>Bienvenue</p>', variables: null, is_active: true, is_system: true },
    ] as any);
    const outcome = await skillOf(services).run(ctx({ question: "je veux modifier le mail d'Activation de compte" }));
    expect(outcome.type).toBe('clarify');
    if (outcome.type !== 'clarify') return;
    expect(outcome.markdown).toContain('Que voulez-vous changer dans **Activation de compte**');
    // La réponse suivante reprend sur ce modèle, plus sur la demande initiale.
    expect(outcome.pendingQuestion).toBe('modifie le modèle de mail account_activation');
    // Carte d'édition : version actuelle, modifiable à la main.
    expect(outcome.templateDraft).toMatchObject({ id: 6, code: 'account_activation', subject: 'Activez votre compte', body_html: '<p>Activer</p>' });
    expect(services.mails.update).not.toHaveBeenCalled();
  });

  // Conversation du 22/10/2026 : chaque précision repartait de la demande initiale.
  it('« liste d’abord » en précision liste les modèles et garde la modification en attente', async () => {
    const services = servicesMock();
    const outcome = await skillOf(services).run(ctx({
      question: "je veux modifier le mail d'Activation de compte\nPrécision apportée : liste d'abord ses models",
    }));
    expect(outcome.type).toBe('clarify');
    if (outcome.type !== 'clarify') return;
    expect(outcome.markdown).toContain('Dossier créé');
    expect(outcome.pendingQuestion).toBe("je veux modifier le mail d'Activation de compte");
  });

  it('un code donné en précision désigne le modèle à modifier', async () => {
    const services = servicesMock();
    services.mails.findAll.mockResolvedValue([
      ...mailTemplates,
      { id: 6, code: 'account_activation', name: 'Activation de compte', category: 'auth', audience: 'collaborator', subject: 'Activez', body_html: '<p>Activer</p>', variables: null, is_active: true, is_system: true },
    ] as any);
    const outcome = await skillOf(services).run(ctx({
      question: "je veux modifier le mail d'Activation de compte\nPrécision apportée : dossier_created_client",
    }));
    expect(outcome.type).toBe('clarify');
    if (outcome.type !== 'clarify') return;
    expect(outcome.markdown).toContain('Que voulez-vous changer dans **Dossier créé**');
    expect(outcome.pendingQuestion).toBe('modifie le modèle de mail dossier_created_client');
  });

  it('« refais le design » s’applique au modèle retenu et garde ses liens', async () => {
    const services = servicesMock();
    services.mails.findByCode.mockImplementation(async (code: string) => code === 'account_activation'
      ? { id: 6, code, name: 'Activation de compte', category: 'auth', audience: 'collaborator', subject: 'Activez', body_html: '<p>{{firstName}}</p><a href="{{activationUrl}}">Activer</a>', variables: null, is_active: true, is_system: true } as any
      : null);
    services.mails.update.mockImplementation(async (id: number, dto: any) => ({ id, code: 'account_activation', ...dto }));
    const llm = {
      complete: jest.fn(async () => JSON.stringify({ body_html: '<div style="padding:24px"><p>Bonjour {{firstName}}</p><a href="{{activationUrl}}" style="background:{{brandColor}}">Activer</a></div>' })),
      stream: jest.fn(), draft: jest.fn(),
    };
    const outcome = await skillOf(services).run(ctx({
      question: 'modifie le modèle de mail account_activation\nPrécision apportée : refais le design et le contenu',
      llm: llm as any,
    }));
    // Proposée dans la carte, pas enregistrée.
    expect(outcome.type).toBe('clarify');
    if (outcome.type !== 'clarify') return;
    expect(outcome.templateDraft?.body_html).toContain('{{activationUrl}}');
    expect(outcome.templateDraft?.original.body_html).toBe('<p>{{firstName}}</p><a href="{{activationUrl}}">Activer</a>');
    expect(outcome.pendingQuestion).toBe('modifie le modèle de mail account_activation');
    expect(services.mails.update).not.toHaveBeenCalled();
    expect(String((llm.complete.mock.calls[0] as unknown[])[0])).toContain('{{activationUrl}}');
  });

  it('refuse une réécriture qui perd le lien d’activation', async () => {
    const services = servicesMock();
    services.mails.findByCode.mockResolvedValueOnce({ id: 6, code: 'account_activation', name: 'Activation de compte', subject: 'Activez', body_html: '<a href="{{activationUrl}}">Activer</a>', is_active: true } as any);
    const llm = { complete: jest.fn(async () => JSON.stringify({ body_html: '<p>Bienvenue</p>' })), stream: jest.fn(), draft: jest.fn() };
    const outcome = await skillOf(services).run(ctx({
      question: 'modifie le modèle de mail account_activation\nPrécision apportée : refais le contenu',
      llm: llm as any,
    }));
    expect(outcome.type).toBe('clarify');
    if (outcome.type !== 'clarify') return;
    expect(outcome.markdown).toContain('activation url');
    expect(services.mails.update).not.toHaveBeenCalled();
  });

  it('modifie un modèle de mail désigné par son nom', async () => {
    const services = servicesMock();
    const llm = { complete: jest.fn(async () => JSON.stringify({ subject: 'Bienvenue au cabinet' })), stream: jest.fn(), draft: jest.fn() };
    const outcome = await skillOf(services).run(ctx({
      question: "modifie le mail du dossier client : mets l'objet à Bienvenue au cabinet",
      params: { family: 'mail' },
      llm: llm as any,
    }));
    expect(outcome.type).toBe('clarify');
    if (outcome.type !== 'clarify') return;
    expect(outcome.templateDraft).toMatchObject({ id: 5, subject: 'Bienvenue au cabinet', body_html: '<p>Bonjour</p>' });
    expect(services.mails.update).not.toHaveBeenCalled();
  });

  it('retouche la version affichée dans la carte (revise), pas la version enregistrée', async () => {
    const services = servicesMock();
    const llm = { complete: jest.fn(async () => JSON.stringify({ body_html: '<p>Bonjour, version courte</p>' })), stream: jest.fn(), draft: jest.fn() };
    const outcome = await skillOf(services).run(ctx({
      question: 'modifie le modèle de mail dossier_created_client\nPrécision apportée : plus court',
      params: { revise: { code: 'dossier_created_client', subject: 'Objet retouché', body_html: '<p>Bonjour, texte modifié à la main</p>' } },
      llm: llm as any,
    }));
    expect(String((llm.complete.mock.calls[0] as unknown[])[0])).toContain('texte modifié à la main');
    expect(outcome.type).toBe('clarify');
    if (outcome.type !== 'clarify') return;
    expect(outcome.templateDraft).toMatchObject({
      subject: 'Objet retouché',
      body_html: '<p>Bonjour, version courte</p>',
      original: { subject: 'Votre dossier {{dossierNumber}}', body_html: '<p>Bonjour</p>' },
    });
  });

  it('ignore une version de carte d’un autre modèle', async () => {
    const services = servicesMock();
    const llm = { complete: jest.fn(async () => JSON.stringify({ subject: 'Nouveau' })), stream: jest.fn(), draft: jest.fn() };
    await skillOf(services).run(ctx({
      question: 'modifie le modèle de mail dossier_created_client\nPrécision apportée : change l’objet',
      params: { revise: { code: 'account_activation', subject: 'Autre', body_html: '<p>Autre modèle</p>' } },
      llm: llm as any,
    }));
    expect(String((llm.complete.mock.calls[0] as unknown[])[0])).not.toContain('Autre modèle');
  });

  it('« modifier un modèle de document » sans nom : propose les vrais modèles, n’en choisit aucun', async () => {
    const services = servicesMock();
    const outcome = await skillOf(services).run(ctx({ question: 'je veux modifier un modele de document' }));
    expect(outcome.type).toBe('clarify');
    if (outcome.type !== 'clarify') return;
    expect(services.pdf.update).not.toHaveBeenCalled();
    expect(outcome.followUps?.map((item) => item.params?.code).filter(Boolean)).toEqual(['facture_standard', 'dossier_synthese']);
    expect(outcome.followUps?.[0]).toMatchObject({ skill: 'modeles', params: { action: 'update', family: 'pdf' } });
  });

  it('signale un code inconnu à la modification', async () => {
    const services = servicesMock();
    const outcome = await skillOf(services).run(ctx({
      question: 'modifie le modèle inconnu_xyz',
      params: { family: 'pdf', code: 'inconnu_xyz' },
    }));
    expect(outcome.type).toBe('clarify');
    expect(services.pdf.update).not.toHaveBeenCalled();
  });

  it('filtre les champs interdits renvoyés par le modèle à la modification', async () => {
    const services = servicesMock();
    const llm = {
      complete: jest.fn(async () => JSON.stringify({
        code: 'pirate', tenant_id: 99, id: 4242, is_system: true, title: 'Nouveau titre',
      })),
      stream: jest.fn(), draft: jest.fn(),
    };
    const outcome = await skillOf(services).run(ctx({
      question: 'change le titre du modèle et mets le code à pirate',
      params: { family: 'pdf', code: 'facture_standard' },
      llm: llm as any,
    }));
    expect(outcome.type).toBe('clarify');
    if (outcome.type !== 'clarify') return;
    expect(outcome.templateDraft).toMatchObject({ family: 'pdf', id: 1, code: 'facture_standard', title: 'Nouveau titre' });
    expect(outcome.templateDraft?.changes).toBeUndefined();
    expect(services.pdf.update).not.toHaveBeenCalled();
  });

  it('à la création, ne garde que les champs du modèle et ignore un bloc inventé', async () => {
    const services = servicesMock();
    const llm = {
      complete: jest.fn(async () => JSON.stringify({
        code: 'relance_test', name: 'Relance', subject: 'Payez', body_html: '<p>Payez</p>',
        tenant_id: 7, is_system: true, header_block: 'header_cabinet',
      })),
      stream: jest.fn(), draft: jest.fn(),
    };
    const outcome = await skillOf(services).run(ctx({
      question: 'crée un modèle de mail de test pour les impayés',
      params: { family: 'mail' },
      llm: llm as any,
    }));
    // Bloc « header_cabinet » inexistant (conversation du 22/10/2026) : bloc par défaut, pas d'échec.
    expect(outcome.type).toBe('clarify');
    if (outcome.type !== 'clarify') return;
    expect(outcome.templateDraft).toMatchObject({ mode: 'create', code: 'relance_test', subject: 'Payez', header_block_id: null });
    expect(outcome.templateDraft).not.toHaveProperty('tenant_id');
    expect(outcome.templateDraft).not.toHaveProperty('is_system');
    // Seuls les blocs mail existants sont proposés (ici aucun : bloc par défaut).
    expect(String((llm.complete.mock.calls[0] as unknown[])[0])).toContain('Omets header_block et footer_block');
    expect(services.mails.create).not.toHaveBeenCalled();
  });

  it('donne un code libre quand le code proposé existe déjà', async () => {
    const services = servicesMock();
    const llm = { complete: jest.fn(async () => JSON.stringify({ code: 'dossier_created_client', name: 'Dossier', subject: 'S', body_html: '<p>B</p>' })), stream: jest.fn(), draft: jest.fn() };
    const outcome = await skillOf(services).run(ctx({ question: 'crée un modèle de mail pour la création de dossier du client', params: { family: 'mail' }, llm: llm as any }));
    expect(outcome.type).toBe('clarify');
    if (outcome.type !== 'clarify') return;
    expect(outcome.templateDraft?.code).toBe('dossier_created_client_2');
  });

  it('retouche un modèle pas encore créé à partir de la carte', async () => {
    const services = servicesMock();
    const llm = { complete: jest.fn(async () => JSON.stringify({ body_html: '<p>Version courte</p>' })), stream: jest.fn(), draft: jest.fn() };
    const outcome = await skillOf(services).run(ctx({
      question: 'raccourcis le texte',
      params: {
        action: 'create', family: 'mail',
        revise: { mode: 'create', draftCode: 'diligence_client', code: 'diligence_client', name: 'Diligence pour client', subject: 'Nouvelle diligence', body_html: '<p>Texte long modifié à la main</p>', category: 'dossier', audience: 'client' },
      },
      llm: llm as any,
    }));
    expect(String((llm.complete.mock.calls[0] as unknown[])[0])).toContain('Texte long modifié à la main');
    expect(outcome.type).toBe('clarify');
    if (outcome.type !== 'clarify') return;
    expect(outcome.templateDraft).toMatchObject({ mode: 'create', code: 'diligence_client', name: 'Diligence pour client', subject: 'Nouvelle diligence', body_html: '<p>Version courte</p>', category: 'dossier' });
    expect(services.mails.create).not.toHaveBeenCalled();
  });
});
