import {
  AGENT_MAX_ROUNDS,
  asActionCall,
  asksForAction,
  asksInformationToo,
  parseAgentReply,
  readAction,
  renderStepResults,
  runAgent,
  type AgentBusinessAction,
  type AgentDeps,
} from './agent-loop';
import { AGENT_TOOLS, runAgentTool, type AgentToolContext } from './agent-tools';
import { dossiersQuery, invoicesQuery, likePattern, readPeriod, teamQuery } from './agent-queries';

function toolContext(rows: Record<string, Array<Record<string, unknown>>> = {}): AgentToolContext & { queries: string[] } {
  const queries: string[] = [];
  return {
    queries,
    tenantId: 2,
    includeConfidential: false,
    runQuery: jest.fn(async (query) => {
      queries.push(query.sql);
      const key = Object.keys(rows).find((k) => query.sql.includes(k));
      return key ? rows[key] : [];
    }),
    freeQuery: jest.fn(async () => ({ lignes: [{ total: 3 }] })),
    help: jest.fn(async () => 'Guide : Facturation › Nouvelle facture'),
    legal: jest.fn(async () => 'Code de procédure civile, art. 192'),
  };
}

function deps(replies: unknown[], tools = toolContext()) {
  const statuses: string[] = [];
  const decide = jest.fn(async () => replies.shift() ?? '{"outils": []}');
  const answer = jest.fn(async ({ steps }) => `réponse (${steps.length} résultats)`);
  const d: AgentDeps = { decide, answer, status: (m) => statuses.push(m), tools };
  return { d, decide, answer, statuses, tools };
}

describe('agent IA — lecture de la réponse du modèle', () => {
  it('lit le JSON, y compris entouré de texte ou de Markdown', () => {
    expect(parseAgentReply('{"outils":[{"nom":"factures","arguments":{"filtre":"non_soldees"}}]}')).toEqual({
      calls: [{ name: 'factures', args: { filtre: 'non_soldees' } }],
    });
    expect(parseAgentReply('Voici :\n```json\n{"outils":[{"nom":"debiteurs"}]}\n```')).toEqual({
      calls: [{ name: 'debiteurs', args: {} }],
    });
    expect(parseAgentReply('{"tools":[{"name":"audiences","args":{"quand":"a_venir"}}]}')?.calls[0].name).toBe('audiences');
    expect(parseAgentReply('{"outils":[]}')).toEqual({ calls: [] });
    expect(parseAgentReply('Je ne sais pas.')).toBeNull();
  });
});

describe('agent IA — boucle', () => {
  it('appelle les outils, relit leurs résultats puis rédige la réponse', async () => {
    const { d, decide, answer, statuses } = deps([
      '{"outils":[{"nom":"debiteurs","arguments":{}}]}',
      '{"outils":[]}',
    ], toolContext({ 'SUM(t.reste)': [{ client: 'Société Éléphant SARL', reste_a_payer: '1271375.00' }] }));

    const outcome = await runAgent({ question: 'Qui nous doit le plus ?', today: '2026-11-18' }, d);

    expect(outcome.steps).toHaveLength(1);
    expect(outcome.steps[0].result).toMatchObject({ total: 1, lignes: [{ client: 'Société Éléphant SARL' }] });
    expect(decide).toHaveBeenCalledTimes(2);
    // Le 2e appel voit les résultats du 1er.
    const secondCall = (decide.mock.calls[1] as any)[0];
    expect(secondCall[secondCall.length - 1].content).toContain('Société Éléphant SARL');
    expect(answer).toHaveBeenCalledWith(expect.objectContaining({ question: 'Qui nous doit le plus ?' }));
    expect(statuses[0]).toContain('débiteurs');
    expect(outcome.answer).toBe('réponse (1 résultats)');
  });

  it('« repondre » : pas de tour de décision supplémentaire après les outils', async () => {
    const { d, decide, answer } = deps(['{"outils":[{"nom":"debiteurs","arguments":{}}],"repondre":true}']);
    const outcome = await runAgent({ question: 'Qui nous doit le plus ?', today: '2026-11-18' }, d);
    expect(decide).toHaveBeenCalledTimes(1);
    expect(outcome.rounds).toBe(1);
    expect(answer).toHaveBeenCalledTimes(1);
    expect(parseAgentReply('{"outils":[],"repondre":true}')).toEqual({ calls: [] });
  });

  it('donne la date du jour et les périodes au modèle', async () => {
    const { d, decide } = deps(['{"outils":[{"nom":"chiffres_facturation","arguments":{}}]}']);
    await runAgent({ question: 'CA de cette année ?', today: '2026-11-18' }, d);
    const system = (decide.mock.calls[0] as any)[0][0].content;
    expect(system).toContain('Date du jour : 2026-11-18');
    expect(system).toContain('du 2026-01-01 au 2026-12-31');
    expect(system).toContain('synthese_dossier');
  });

  it('rend la main au circuit habituel quand aucun outil n’est appelé', async () => {
    const { d, answer } = deps(['{"outils":[]}']);
    const outcome = await runAgent({ question: 'Bonjour', today: '2026-11-18' }, d);
    expect(outcome.fallback).toBe(true);
    expect(answer).not.toHaveBeenCalled();
  });

  it('relance une fois un modèle qui ne répond pas en JSON', async () => {
    const { d, decide } = deps(['Bien sûr ! Je vais chercher.', '{"outils":[{"nom":"factures","arguments":{}}]}']);
    const outcome = await runAgent({ question: 'Mes factures ?', today: '2026-11-18' }, d);
    expect(decide).toHaveBeenCalledTimes(3);
    expect(outcome.steps[0].name).toBe('factures');
  });

  it('ne répète pas un même appel et s’arrête au nombre de tours maximal', async () => {
    const same = '{"outils":[{"nom":"factures","arguments":{"filtre":"toutes"}}]}';
    const { d, decide } = deps([same, same, same]);
    const outcome = await runAgent({ question: 'q', today: '2026-11-18' }, d);
    expect(outcome.steps).toHaveLength(1);
    expect(decide).toHaveBeenCalledTimes(2);

    const many = Array.from({ length: 10 }, (_, i) => `{"outils":[{"nom":"chercher","arguments":{"texte":"x${i}"}}]}`);
    const loop = deps(many);
    const bounded = await runAgent({ question: 'q', today: '2026-11-18' }, loop.d);
    expect(bounded.rounds).toBe(AGENT_MAX_ROUNDS);
  });

  it('transmet les échanges précédents (question de suivi)', async () => {
    const { d, decide } = deps(['{"outils":[{"nom":"factures","arguments":{"dossier":"DOS-7-0003"}}]}']);
    await runAgent({ question: 'Et ses factures ?', history: 'Utilisateur : Fais le point sur DOS-7-0003', today: '2026-11-18' }, d);
    expect((decide.mock.calls[0] as any)[0][1].content).toContain('DOS-7-0003');
  });
});

describe('agent IA — compétences et demandes de précision', () => {
  const skills = [
    { code: 'convention_honoraires', label: 'Convention d’honoraires', description: 'Rédige la convention d’honoraires du dossier', targets: ['dossier'] },
    { code: 'whatsapp', label: 'Message WhatsApp', description: 'Prépare un message WhatsApp au client', targets: ['client', 'dossier'] },
  ];

  it('passe la main à la compétence choisie, avec sa cible, sans rédiger', async () => {
    const { d, answer, decide } = deps([
      '{"outils":[{"nom":"competence","arguments":{"code":"convention_honoraires","cible":{"type":"dossier","reference":"DOS-7-0001"}}}]}',
    ]);
    const outcome = await runAgent({ question: 'Prépare le document qui fixe nos honoraires pour DOS-7-0001', today: '2026-11-19', skills }, d);
    expect(outcome.handoff).toEqual({ code: 'convention_honoraires', cible: { type: 'dossier', reference: 'DOS-7-0001' } });
    expect(answer).not.toHaveBeenCalled();
    const system = (decide.mock.calls[0] as any)[0][0].content;
    expect(system).toContain('convention_honoraires — Convention d’honoraires');
    expect(system).toContain('[cible : dossier]');
  });

  it('peut lire avant de passer la main (chercher la cible, puis la compétence)', async () => {
    const { d } = deps([
      '{"outils":[{"nom":"chercher","arguments":{"texte":"Éléphant"}}]}',
      '{"outils":[{"nom":"competence","arguments":{"code":"whatsapp","cible":{"type":"client","reference":"Société Éléphant SARL"}}}]}',
    ]);
    const outcome = await runAgent({ question: 'Écris un petit mot à Éléphant', today: '2026-11-19', skills }, d);
    expect(outcome.steps.map((step) => step.name)).toEqual(['chercher']);
    expect(outcome.handoff?.code).toBe('whatsapp');
  });

  it('un code de compétence appelé comme un outil est un passage de main', async () => {
    const { d } = deps(['{"outils":[{"nom":"convention_honoraires","arguments":{"dossier":"DOS-7-0001"}}]}']);
    const outcome = await runAgent({ question: 'q', today: '2026-11-19', skills }, d);
    expect(outcome.handoff).toEqual({ code: 'convention_honoraires', cible: { type: 'dossier', reference: 'DOS-7-0001' } });
  });

  it('ignore une compétence hors catalogue (non autorisée ou inventée)', async () => {
    const { d } = deps([
      '{"outils":[{"nom":"competence","arguments":{"code":"supprimer_dossier"}}]}',
    ]);
    const outcome = await runAgent({ question: 'q', today: '2026-11-19', skills }, d);
    expect(outcome.handoff).toBeUndefined();
    expect(outcome.fallback).toBe(true);
  });

  it('pose une question avec des choix quand la demande est ambiguë', async () => {
    const { d, answer } = deps([
      '{"outils":[{"nom":"chercher","arguments":{"texte":"Mballa"}}]}',
      '{"outils":[{"nom":"demander_precision","arguments":{"question":"Quel dossier Mballa ?","choix":["DOS-7-0003 (Jean Mballa)","DOS-7-0006 (Paul Mballa)",""]}}]}',
    ]);
    const outcome = await runAgent({ question: 'Fais le point sur le dossier de Mballa', today: '2026-11-19' }, d);
    expect(outcome.clarification).toEqual({ question: 'Quel dossier Mballa ?', choix: ['DOS-7-0003 (Jean Mballa)', 'DOS-7-0006 (Paul Mballa)'] });
    expect(answer).not.toHaveBeenCalled();
  });

  it('écriture : résout la référence puis transmet une demande précise, sans rien écrire', async () => {
    const { d, decide, answer } = deps([
      '{"outils":[{"nom":"factures","arguments":{"client":"Jean Mballa","filtre":"non_soldees"}}]}',
      '{"outils":[{"nom":"preparer_operation","arguments":{"demande":"Enregistrer un paiement de 25000 FCFA le 2026-11-19 sur la facture FAC-7-0005"}}]}',
    ]);
    const outcome = await runAgent({ question: 'Enregistre 25 000 sur la dernière facture de Jean Mballa', today: '2026-11-19', allowWrite: true }, d);
    expect(outcome.write).toEqual({ demande: 'Enregistrer un paiement de 25000 FCFA le 2026-11-19 sur la facture FAC-7-0005' });
    expect(outcome.steps.map((step) => step.name)).toEqual(['factures']);
    expect(answer).not.toHaveBeenCalled();
    expect((decide.mock.calls[0] as any)[0][0].content).toContain('preparer_operation');
  });

  it('enchaînement : lit, puis passe la main en demandant d’afficher la réponse d’abord', async () => {
    const { d, answer } = deps([
      '{"outils":[{"nom":"debiteurs","arguments":{"limite":1}}]}',
      '{"outils":[{"nom":"competence","arguments":{"code":"whatsapp","cible":{"type":"client","reference":"Société Éléphant SARL"},"repondre_d_abord":true}}]}',
    ]);
    const outcome = await runAgent({ question: 'Qui nous doit le plus ? Écris-lui un WhatsApp.', today: '2026-11-19', skills }, d);
    expect(outcome.handoff).toEqual({ code: 'whatsapp', cible: { type: 'client', reference: 'Société Éléphant SARL' }, answerFirst: true });
    expect(outcome.steps.map((step) => step.name)).toEqual(['debiteurs']);
    // La réponse est rédigée par l'appelant, avant la compétence.
    expect(answer).not.toHaveBeenCalled();
  });

  it('enchaînement vers une écriture : le drapeau est gardé sur l’opération', async () => {
    const { d } = deps([
      '{"outils":[{"nom":"synthese_dossier","arguments":{"dossier":"DOS-7-0006"}}]}',
      '{"outils":[{"nom":"preparer_operation","arguments":{"demande":"Créer la tâche « Préparer les conclusions » sur DOS-7-0006, échéance 2026-12-10","repondre_d_abord":true}}]}',
    ]);
    const outcome = await runAgent({ question: 'Fais le point sur DOS-7-0006 et crée une tâche', today: '2026-11-19', allowWrite: true }, d);
    expect(outcome.write).toEqual({ demande: 'Créer la tâche « Préparer les conclusions » sur DOS-7-0006, échéance 2026-12-10', answerFirst: true });
  });

  it('action demandée avec la lecture : les résultats sont suivis d’un rappel unique de l’action', async () => {
    const { d, decide } = deps([
      '{"outils":[{"nom":"debiteurs","arguments":{"limite":1}}]}',
      '{"outils":[{"nom":"competence","arguments":{"code":"whatsapp","cible":{"type":"client","reference":"Société Éléphant SARL"},"repondre_d_abord":true}}]}',
    ]);
    const outcome = await runAgent({ question: 'Qui nous doit le plus ? Prépare-lui un WhatsApp.', today: '2026-11-19', skills }, d);
    expect(outcome.handoff?.code).toBe('whatsapp');
    expect(decide).toHaveBeenCalledTimes(2);
    expect((decide.mock.calls[1] as any)[0].at(-1).content).toContain('ACTION');
  });

  it('lecture demandée avec « repondre » : le rappel de l’action passe avant la réponse', async () => {
    const { d, decide, answer } = deps([
      '{"outils":[{"nom":"factures","arguments":{"client":"Éléphant","filtre":"non_soldees"}}],"repondre":true}',
      '{"outils":[{"nom":"competence","arguments":{"code":"whatsapp","cible":{"type":"client","reference":"Société Éléphant SARL"}}}]}',
    ]);
    const outcome = await runAgent({ question: 'Quelle facture est la plus ancienne ? Prépare une relance par WhatsApp.', today: '2026-11-19', skills }, d);
    expect(outcome.handoff?.code).toBe('whatsapp');
    expect(answer).not.toHaveBeenCalled();
    expect((decide.mock.calls[1] as any)[0].at(-1).content).toMatch(/RÉSULTATS[\s\S]*ACTION/);
  });

  it('pas de rappel pour une simple lecture, ni sans compétence ou écriture possible', async () => {
    const read = deps(['{"outils":[{"nom":"debiteurs","arguments":{}}]}', '{"outils":[]}']);
    await runAgent({ question: 'Qui nous doit le plus ?', today: '2026-11-19', skills }, read.d);
    expect(read.decide).toHaveBeenCalledTimes(2);
    expect((read.decide.mock.calls[1] as any)[0].at(-1).content).not.toContain('ACTION');
    const noSkill = deps(['{"outils":[{"nom":"debiteurs","arguments":{}}]}', '{"outils":[]}']);
    await runAgent({ question: 'Qui nous doit le plus ? Prépare-lui un WhatsApp.', today: '2026-11-19' }, noSkill.d);
    expect(noSkill.decide).toHaveBeenCalledTimes(2);
    expect((noSkill.decide.mock.calls[1] as any)[0].at(-1).content).not.toContain('ACTION');
  });

  it('distingue une action d’une lecture', () => {
    expect(asksForAction('Qui nous doit le plus ? Prépare-lui une mise en demeure.')).toBe(true);
    expect(asksForAction('Quelle est la facture la plus ancienne de X ? Prépare une relance pour celle-ci.')).toBe(true);
    expect(asksForAction('Crée une tâche « Préparer les conclusions »')).toBe(true);
    expect(asksForAction('Fais le point sur le dossier DOS-7-0001.')).toBe(false);
    expect(asksForAction('Quelles factures ont été envoyées ce mois-ci ?')).toBe(false);
    expect(asksForAction('Qui a créé le dossier DOS-7-0001 ?')).toBe(false);
    expect(asksForAction('Liste les relances envoyées')).toBe(false);
    // « Calcule le chiffre d'affaires » est une lecture (les calculs de délai passent par leur compétence).
    expect(asksForAction("Calcule le chiffre d'affaires de cette année")).toBe(false);
  });

  it('reconnaît une question posée avec l’action (« qui… ? prépare-lui… », « fais le point… et… »)', () => {
    expect(asksInformationToo('Qui nous doit le plus ? Prépare-lui une mise en demeure.')).toBe(true);
    expect(asksInformationToo('Fais le point sur le dossier DOS-7-0006 et crée une tâche « Préparer les conclusions ».')).toBe(true);
    expect(asksInformationToo('Quelle est la facture la plus ancienne de X, puis prépare une relance')).toBe(true);
    expect(asksInformationToo('Enregistre un paiement de 25 000 FCFA sur la plus ancienne facture impayée de X.')).toBe(false);
    expect(asksInformationToo('Peux-tu préparer une relance pour la facture FAC-7-0001 ?')).toBe(false);
    expect(asksInformationToo('Crée une tâche « Relancer le greffe » pour ce dossier, à faire avant le 15/12/2026.')).toBe(false);
  });

  it('mode lecture : l’outil d’écriture n’est ni proposé ni accepté', async () => {
    const { d, decide } = deps(['{"outils":[{"nom":"preparer_operation","arguments":{"demande":"Supprimer le client X"}}]}']);
    const outcome = await runAgent({ question: 'Supprime le client X', today: '2026-11-19', allowWrite: false }, d);
    expect(outcome.write).toBeUndefined();
    expect(outcome.fallback).toBe(true);
    expect((decide.mock.calls[0] as any)[0][0].content).not.toContain('preparer_operation');
  });

  it('sans catalogue, l’agent ne propose aucune compétence', async () => {
    const { d, decide } = deps(['{"outils":[]}']);
    await runAgent({ question: 'q', today: '2026-11-19' }, d);
    const system = (decide.mock.calls[0] as any)[0][0].content;
    expect(system).not.toContain('COMPÉTENCES');
    expect(system).toContain('demander_precision');
  });
});

describe('agent IA — actions métier directes', () => {
  const actions: AgentBusinessAction[] = [
    {
      name: 'ajouter_collaborateur',
      label: "Ajout d'un collaborateur",
      description: "Ajoute un collaborateur du cabinet à l'équipe d'un dossier.",
      target: 'dossier',
      params: [{ name: 'collaborateur', required: true }],
    },
  ];

  it('« ajoute-le aux 2 dossiers ? » : lit les dossiers, puis une action par dossier, sans planificateur ni réponse', async () => {
    const { d, decide, answer } = deps([
      '{"outils":[{"nom":"dossiers","arguments":{}}]}',
      '{"outils":[{"nom":"action_metier","arguments":{"action":"ajouter_collaborateur","cibles":["DOS-2026-0001","DOS-2026-0002"],"parametres":{"collaborateur":"Nogoh Brice","inconnu":"x"}}}]}',
    ]);
    const outcome = await runAgent(
      { question: "l'ajoute le en tant que collaborateur des 2 dossier du cabinet ?", today: '2026-11-19', allowWrite: true, actions },
      d,
    );
    expect(outcome.action).toEqual({
      name: 'ajouter_collaborateur',
      targets: ['DOS-2026-0001', 'DOS-2026-0002'],
      params: { collaborateur: 'Nogoh Brice' },
    });
    expect(outcome.write).toBeUndefined();
    expect(answer).not.toHaveBeenCalled();
    const system = (decide.mock.calls[0] as any)[0][0].content;
    expect(system).toContain('action_metier');
    expect(system).toContain('ajouter_collaborateur (cible : dossier)');
    expect(system).toContain('terminée par « ? »');
    // Demande d'action : après la lecture, le rappel cite action_metier.
    expect((decide.mock.calls[1] as any)[0].at(-1).content).toContain('action_metier');
  });

  it('une action appelée comme un outil devient action_metier, cible lue dans son argument', async () => {
    const { d } = deps(['{"outils":[{"nom":"ajouter_collaborateur","arguments":{"dossier":"DOS-2026-0002","collaborateur":"Nogoh Brice"}}]}']);
    const outcome = await runAgent({ question: 'Ajoute Nogoh Brice au dossier DOS-2026-0002', today: '2026-11-19', allowWrite: true, actions }, d);
    expect(outcome.action).toEqual({ name: 'ajouter_collaborateur', targets: ['DOS-2026-0002'], params: { collaborateur: 'Nogoh Brice' } });
  });

  it('mode lecture : aucune action proposée ni acceptée', async () => {
    const { d, decide } = deps(['{"outils":[{"nom":"action_metier","arguments":{"action":"ajouter_collaborateur","cibles":["DOS-1"]}}]}']);
    const outcome = await runAgent({ question: 'Ajoute X au dossier DOS-1', today: '2026-11-19', allowWrite: false, actions }, d);
    expect(outcome.action).toBeUndefined();
    expect(outcome.fallback).toBe(true);
    expect((decide.mock.calls[0] as any)[0][0].content).not.toContain('action_metier');
  });

  it('valide l’action : nom connu, cibles présentes et bornées, paramètres déclarés seulement', () => {
    expect(readAction({ action: 'supprimer_tout', cibles: ['DOS-1'] }, actions)).toBeNull();
    expect(readAction({ action: 'ajouter_collaborateur', cibles: [] }, actions)).toBeNull();
    const many = Array.from({ length: 15 }, (_, i) => `DOS-${i}`);
    expect(readAction({ action: 'ajouter_collaborateur', cibles: many }, actions)?.targets).toHaveLength(10);
    expect(readAction({ action: 'ajouter_collaborateur', cible: { type: 'dossier', reference: 'DOS-1' }, repondre_d_abord: true }, actions)).toEqual({
      name: 'ajouter_collaborateur',
      targets: ['DOS-1'],
      params: {},
      answerFirst: true,
    });
    expect(asActionCall({ name: 'dossiers', args: {} }, actions)).toEqual({ name: 'dossiers', args: {} });
  });

  it('reconnaît l’ajout, le retrait ou le changement d’un membre comme une action, même tourné en question', () => {
    expect(asksForAction("l'ajoute le en tant que collaborateur des 2 dossier du cabinet ?")).toBe(true);
    expect(asksForAction('Retire Paul Ngo du dossier DOS-1')).toBe(true);
    expect(asksForAction('Mets Maître Ekane sur ce dossier')).toBe(true);
    expect(asksForAction('Quels sont les employés du cabinet ?')).toBe(false);
    expect(asksForAction('Liste les dossiers dont Nogoh Brice est responsable')).toBe(false);
  });
});

describe('agent IA — outils', () => {
  it('outil inconnu ou en erreur : résultat lisible, jamais d’exception', async () => {
    const ctx = toolContext();
    expect(await runAgentTool('supprimer_tout', {}, ctx)).toEqual({ erreur: 'outil inconnu : supprimer_tout' });
    (ctx.runQuery as jest.Mock).mockRejectedValueOnce(new Error("Acces IA refuse : droit view_factures"));
    expect(await runAgentTool('factures', {}, ctx)).toMatchObject({ erreur: expect.stringContaining('accès refusé') });
    (ctx.runQuery as jest.Mock).mockRejectedValueOnce(new Error('ER_PARSE_ERROR'));
    expect(await runAgentTool('factures', {}, ctx)).toEqual({ erreur: 'consultation impossible' });
  });

  it('synthèse d’un dossier introuvable : le dit, sans autre requête', async () => {
    const ctx = toolContext();
    expect(await runAgentTool('synthese_dossier', { dossier: 'DOS-1999-99999' }, ctx)).toEqual({
      introuvable: 'aucun dossier DOS-1999-99999 dans ce cabinet',
    });
    expect(ctx.queries).toHaveLength(1);
  });

  it('synthèse d’un dossier : identité, factures, audiences, actions, éléments facturables', async () => {
    const ctx = toolContext({ 'LIMIT 1': [{ dossier_number: 'DOS-7-0001', client: 'Société Éléphant SARL' }] });
    const result = await runAgentTool('synthese_dossier', { dossier: 'DOS-7-0001' }, ctx);
    expect(Object.keys(result)).toEqual(['identite', 'factures', 'audiences', 'actions_ouvertes', 'elements_facturables']);
    expect(ctx.queries).toHaveLength(5);
  });

  it('« combien » : le total réel des dossiers, pas le nombre de lignes affichées', async () => {
    const ctx = toolContext({ 'FROM dossiers d': [{ dossier_number: 'DOS-7-0006', total_correspondant: 4 }] });
    const result = await runAgentTool('dossiers', { statut: 'ACTIVE', limite: 1 }, ctx);
    expect(result).toEqual({ total: 4, lignes_affichees: 1, lignes: [{ dossier_number: 'DOS-7-0006' }], liste_partielle: true });
  });

  it('point du jour : audiences, retards, échéances, factures à relancer et à facturer en un appel', async () => {
    const ctx = toolContext({
      'FROM audiences a': [{ dossier: 'DOS-7-0001', date: '2026-11-21' }],
      'FROM factures f': [{ numero: 'FAC-7-0001', reste_a_payer: 592500 }],
    });
    const result = await runAgentTool('point_du_jour', { jours: 99 }, ctx);
    expect(result).toMatchObject({
      horizon_jours: 31,
      audiences_a_venir: { total: 1, lignes: [{ dossier: 'DOS-7-0001' }] },
      factures_a_relancer: { total: 1 },
      actions_en_retard: { total: 0 },
      actions_a_echeance: { total: 0 },
      elements_a_facturer: { total: 0 },
    });
    expect(ctx.queries).toHaveLength(5);
    expect(ctx.queries.some((sql) => sql.includes('a.due_at >= NOW() AND a.due_at < NOW() + INTERVAL ? DAY'))).toBe(true);
  });

  it('équipe : liste des collaborateurs avec leurs dossiers', async () => {
    const ctx = toolContext({ 'FROM employee e': [{ collaborateur: 'Nogoh Brice', fonction: 'Avocat', dossiers_responsable: 0, total_correspondant: 3 }] });
    const result = await runAgentTool('equipe', {}, ctx);
    expect(result).toMatchObject({ total: 3, lignes: [{ collaborateur: 'Nogoh Brice', fonction: 'Avocat' }], liste_partielle: true });
  });

  it('requête libre, aide et base juridique passent par le contexte', async () => {
    const ctx = toolContext();
    expect(await runAgentTool('requete_libre', { question: 'nombre de bulletins de paie' }, ctx)).toMatchObject({ total: 1 });
    expect(await runAgentTool('aide_application', { question: 'créer une facture' }, ctx)).toEqual({ extraits: 'Guide : Facturation › Nouvelle facture' });
    expect(await runAgentTool('base_juridique', { question: 'délai d’appel' }, ctx)).toEqual({ extraits: 'Code de procédure civile, art. 192' });
  });

  it('chaque outil est décrit pour le modèle', () => {
    for (const [name, tool] of Object.entries(AGENT_TOOLS)) {
      expect(tool.description.length).toBeGreaterThan(20);
      expect(tool.args).toMatch(/^\{/);
      expect(name).toMatch(/^[a-z_]+$/);
    }
  });
});

describe('agent IA — requêtes métier', () => {
  it('filtre toujours le cabinet et les lignes supprimées, avec des paramètres liés', () => {
    const q = invoicesQuery(2, { filtre: 'en_retard', retard_min_jours: 30, client: "O'Neil", dossier: 'DOS-1' });
    expect(q.sql).toContain('f.tenant_id = ?');
    expect(q.sql).toContain('f.deleted_at IS NULL');
    expect(q.sql).toContain("f.status <> '5'");
    expect(q.sql).not.toContain("O'Neil");
    expect(q.params).toEqual([2, 'DOS-1', "%O'Neil%", "O'Neil", 30]);
  });

  it('nettoie les périodes et les motifs LIKE', () => {
    expect(readPeriod({ du: '2026-01-01', au: 'demain' })).toEqual({ du: '2026-01-01' });
    expect(likePattern('100%_sûr')).toBe('%100\\%\\_sûr%');
  });

  it('équipe : collaborateurs du cabinet courant, dossiers confidentiels comptés seulement si visibles', () => {
    const hidden = teamQuery(2, { texte: 'Nogoh', fonction: 'Avocat' }, false);
    expect(hidden.sql).toContain('e.tenant_id = ?');
    expect(hidden.sql).toContain('e.deleted_at IS NULL');
    expect(hidden.sql).toContain('d.confidentiality_level = 0');
    expect(hidden.params).toEqual([2, '%Nogoh%', '%Nogoh%', '%Nogoh%', 'avocat']);
    // `user` n'est lue que pour les noms, jamais déclarée (refusée au SQL libre).
    expect(hidden.tables).toEqual(['employee', 'dossiers']);
    expect(teamQuery(2, {}, true).sql).not.toContain('confidentiality_level');
  });

  it('dossiers d’un membre : responsable, collaborateur, ou l’un des deux', () => {
    const either = dossiersQuery(2, { membre: 'Nogoh Brice' }, false);
    expect(either.sql).toContain('ul.id = d.lawyer_id');
    expect(either.sql).toContain('dc.dossier_id = d.id');
    expect(either.params).toEqual([2, ...Array(6).fill('%Nogoh Brice%')]);
    const lawyer = dossiersQuery(2, { membre: 'Nogoh Brice', role: 'responsable' }, true);
    expect(lawyer.sql).not.toContain('dossier_collaborators dc');
    expect(lawyer.params).toEqual([2, ...Array(3).fill('%Nogoh Brice%')]);
    expect(dossiersQuery(2, {}, true).params).toEqual([2]);
  });

  it('borne les résultats envoyés au modèle', () => {
    const big = { lignes: Array.from({ length: 2000 }, (_, i) => ({ numero: `F-${i}` })) };
    const text = renderStepResults([{ name: 'factures', args: {}, result: big }]);
    expect(text.length).toBeLessThan(9_200);
    expect(text).toContain('(tronqué)');
  });
});
