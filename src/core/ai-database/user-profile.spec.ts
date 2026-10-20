/// <reference types="jest" />
import {
  UserProfileSnapshot,
  buildSelfProfileAnswer,
  isFirstPersonQuestion,
  looseSelfTopics,
  renderSqlUserLine,
  renderUserProfileBlock,
  selfProfileTopics,
} from './user-profile';
import type { AccessProfile } from './ai-access-policy';

const snapshot = (extra: Partial<UserProfileSnapshot> = {}): UserProfileSnapshot => ({
  userId: 12,
  name: 'Awa Ngono',
  email: 'awa@cabinet.cm',
  position: 'juriste',
  roleName: 'Juriste',
  isAdmin: false,
  capabilities: [
    { label: 'Dossiers', actions: ['consulter les dossiers', 'modifier un dossier'] },
    { label: 'Audiences', actions: ['consulter les audiences'] },
  ],
  denied: ['Paie', 'Comptabilité'],
  cabinet: { name: 'Cabinet Kaby', code: 'm05sdnfv' },
  plan: {
    name: 'Pro',
    code: 'pro',
    included: ["l'assistant IA", 'la facturation', 'les rapports avancés'],
    excluded: ['la paie', 'les dépenses'],
  },
  subscription: {
    status: 'active',
    cycle: 'monthly',
    isTrial: false,
    endsAt: '2026-11-15T00:00:00.000Z',
    trialEndsAt: null,
    autoRenew: true,
    daysRemaining: 26,
  },
  quotas: [
    { label: 'Collaborateurs', used: 8, max: 10 },
    { label: 'Dossiers', used: 140, max: null },
  ],
  ai: { used: 87, max: 1000, resetsAt: '2026-11-01T00:00:00.000Z', enabled: true },
  canSeeBilling: false,
  skills: 30,
  ...extra,
});

const access: AccessProfile = {
  isAdmin: false,
  roleName: 'Juriste',
  permissions: new Map([['view_dossiers', 'Consulter les dossiers'], ['view_audiences', 'Consulter les audiences']]),
};

describe('questions sur l’utilisateur lui-même', () => {
  it.each([
    ['quel est mon role dans le cabinet', 'role'],
    ['Quel est mon rôle ?', 'role'],
    ['suis-je administrateur ?', 'role'],
    ["quels est mon plan d'abonement actuel", 'plan'],
    ['mon abonnement expire quand ?', 'plan'],
    ['combien de requêtes IA me reste-t-il ce mois ?', 'quotas'],
    ['mes quotas', 'quotas'],
    ['qui suis-je ?', 'identity'],
    ['quel est le nom de mon cabinet', 'cabinet'],
    ['que puis-je faire ?', 'rights'],
  ])('« %s » → %s', (question, topic) => {
    expect(selfProfileTopics(question)).toContain(topic);
  });

  it.each([
    'quel est mon rôle dans ce dossier',
    'prépare mon plan de plaidoirie',
    "fais mon plan d'action pour le dossier",
    'quel est mon rôle et liste mes dossiers',
    'liste les dossiers du cabinet',
    'quels sont les délais d’appel ?',
  ])('« %s » : pas une question sur le compte', (question) => {
    expect(selfProfileTopics(question)).toEqual([]);
  });

  it('repli permissif avant une demande de précision', () => {
    expect(looseSelfTopics('et mon forfait il couvre quoi')).toContain('plan');
    expect(looseSelfTopics('les permissions que j ai')).toContain('rights');
    expect(looseSelfTopics('le plan de la salle d audience')).toEqual([]);
  });

  it('première personne', () => {
    expect(isFirstPersonQuestion('liste mes dossiers')).toBe(true);
    expect(isFirstPersonQuestion('liste les dossiers')).toBe(false);
  });
});

describe('réponses construites à partir du profil', () => {
  it('rôle : identité, fonction, cabinet, profil d’accès et modules', () => {
    const answer = buildSelfProfileAnswer('quel est mon role dans le cabinet', snapshot(), access)!;
    expect(answer).toContain('**Awa Ngono**');
    expect(answer).toContain('**Juriste**');
    expect(answer).toContain('**Cabinet Kaby**');
    expect(answer).toContain('dossiers, audiences');
    expect(answer).toContain('Non accessible : paie, comptabilité');
    expect(answer).not.toMatch(/Que désignez-vous/);
  });

  it('administrateur : tous les droits', () => {
    const answer = buildSelfProfileAnswer('quel est mon rôle', snapshot({ isAdmin: true, roleName: 'Associé' }), { ...access, isAdmin: true })!;
    expect(answer).toContain('administrateur du cabinet');
  });

  it('plan : formule, abonnement, modules et lien vers la page Abonnement, sans tarif sans droit', () => {
    const answer = buildSelfProfileAnswer("quels est mon plan d'abonement actuel", snapshot(), access)!;
    expect(answer).toContain('plan **Pro**');
    expect(answer).toContain('Abonnement actif, mensuel');
    expect(answer).toContain('26 jours restants');
    expect(answer).toContain('Non inclus : la paie, les dépenses');
    expect(answer).toContain('/abonnement');
    expect(answer).not.toContain('FCFA');
  });

  it('plan : le tarif apparaît quand il est fourni (droit de gérer l’abonnement)', () => {
    const answer = buildSelfProfileAnswer('mon plan actuel', snapshot({ plan: { ...snapshot().plan!, price: '25 000 XAF / mois' } }), access)!;
    expect(answer).toContain('25 000 XAF / mois');
  });

  it('module demandé : oui ou non', () => {
    const answer = buildSelfProfileAnswer('la paie est-elle incluse dans mon plan ?', snapshot(), access)!;
    expect(answer).toContain("🔒 La paie n'est pas incluse dans votre plan.");
  });

  it('quotas : tableau et remise à zéro des requêtes IA', () => {
    const answer = buildSelfProfileAnswer('mes quotas', snapshot(), access)!;
    expect(answer).toContain('| Collaborateurs | 8 | 10 |');
    expect(answer).toContain('| Dossiers | 140 | illimité |');
    expect(answer).toContain('| Requêtes IA ce mois | 87 | 1000 |');
    expect(answer).toContain('01/11/2026');
  });

  it('sans plan rattaché', () => {
    const answer = buildSelfProfileAnswer('mon abonnement', snapshot({ plan: null, subscription: null }), access)!;
    expect(answer).toContain("Aucun plan n'est rattaché");
  });
});

describe('profil embarqué dans les prompts', () => {
  it('bloc complet : rôle, droits, plan, abonnement, quotas', () => {
    const block = renderUserProfileBlock(snapshot(), 'full');
    expect(block).toContain("CONTEXTE DE L'UTILISATEUR CONNECTÉ");
    expect(block).toContain("Profil d'accès : Juriste");
    expect(block).toContain('Dossiers (consulter les dossiers, modifier un dossier)');
    expect(block).toContain('Non accessible avec ce rôle : Paie, Comptabilité');
    expect(block).toContain('Plan : Pro');
    expect(block).toContain('Abonnement : abonnement actif');
    expect(block).toContain('Requêtes IA ce mois : 87 / 1000');
  });

  it('bloc court (classification) : sans détail des droits ni quotas', () => {
    const block = renderUserProfileBlock(snapshot(), 'short');
    expect(block).toContain('Modules accessibles : Dossiers, Audiences');
    expect(block).not.toContain('Requêtes IA');
  });

  it('SQL : identifiant du collaborateur pour « mes dossiers »', () => {
    expect(renderSqlUserLine(snapshot())).toContain('collaborateur id = 12');
    expect(renderSqlUserLine(null)).toBe('');
  });
});
