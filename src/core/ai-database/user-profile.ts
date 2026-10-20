// src/core/ai-database/user-profile.ts
//
// Profil de l'utilisateur connecté (identité, rôle, droits, cabinet, plan,
// abonnement, quotas) : bloc de contexte ajouté aux prompts du chat et
// réponses directes aux questions « quel est mon rôle / mon plan ? ».
// Fonctions pures ; le chargement est fait par UserProfileService.

import {
  AccessProfile,
  buildCapabilityAnswer,
  isCapabilityQuestion,
  normalizeAccessText,
  summarizeCapabilities,
} from './ai-access-policy';

export interface UserProfileQuota {
  label: string;
  used: number;
  /** null : illimité. */
  max: number | null;
  unit?: string;
}

export interface UserProfileSnapshot {
  userId: number | null;
  name: string;
  email: string;
  /** Fonction dans le cabinet (avocat, secrétaire…). */
  position: string;
  /** Profil d'accès (rôle) tel que nommé dans le cabinet. */
  roleName: string;
  isAdmin: boolean;
  capabilities: Array<{ label: string; actions: string[] }>;
  denied: string[];
  cabinet: { name: string; code: string } | null;
  plan: {
    name: string;
    code: string;
    included: string[];
    excluded: string[];
    price?: string;
  } | null;
  subscription: {
    status: string;
    cycle: string;
    isTrial: boolean;
    endsAt: string | null;
    trialEndsAt: string | null;
    autoRenew: boolean;
    daysRemaining: number | null;
  } | null;
  quotas: UserProfileQuota[];
  ai: { used: number; max: number | null; resetsAt: string | null; enabled: boolean } | null;
  /** Montants et tarifs visibles (administrateur ou droit `manage_subscription`). */
  canSeeBilling: boolean;
  skills: number;
}

/** Modules optionnels d'un plan, dans l'ordre d'affichage. */
export const PLAN_MODULE_LABELS: Array<{ key: string; label: string; pattern: RegExp }> = [
  { key: 'ai_enabled', label: "l'assistant IA", pattern: /\b(ia|assistant|intelligence artificielle|chat)\b/ },
  { key: 'invoicing_enabled', label: 'la facturation', pattern: /\b(factur\w*)\b/ },
  { key: 'reporting_enabled', label: 'les rapports avancés', pattern: /\b(rapports?|reporting|statistiques?)\b/ },
  { key: 'documents_enabled', label: 'la gestion documentaire', pattern: /\b(documents?|ged)\b/ },
  { key: 'payroll_enabled', label: 'la paie', pattern: /\b(paie|bulletins?|salaires?)\b/ },
  { key: 'expenses_enabled', label: 'les dépenses', pattern: /\b(depenses?|frais)\b/ },
];

const SUBSCRIPTION_STATUS_LABELS: Record<string, string> = {
  trial: "en période d'essai",
  active: 'actif',
  expired: 'expiré',
  suspended: 'suspendu',
  cancelled: 'résilié',
  pending_payment: 'en attente de paiement',
};

const CYCLE_LABELS: Record<string, string> = { monthly: 'mensuel', yearly: 'annuel' };

export type SelfTopic = 'identity' | 'role' | 'rights' | 'plan' | 'modules' | 'quotas' | 'cabinet';

const SELF_PATTERNS: Array<{ topic: SelfTopic; patterns: RegExp[] }> = [
  {
    topic: 'identity',
    patterns: [
      /\bqui (suis.je|je suis)\b/,
      /\bje suis qui\b/,
      /\b(mon compte|mon profil|mes informations|mes infos|mon nom|mon (adresse )?e.?mail)\b/,
      /\b(avec )?quel compte\b.{0,20}\b(connecte|suis.je)\b/,
    ],
  },
  {
    topic: 'role',
    patterns: [
      /\b(mon|ma) (role|poste|fonction|profil d acces|statut|niveau d acces|grade)\b/,
      /\bsuis.je (un |une |l )?(admin\w*|avocat|associe|stagiaire|secretaire|juriste|collaborat\w*|huissier|comptable|gerant)\b/,
      /\b(je suis|j ai) quel (role|poste|profil)\b/,
    ],
  },
  {
    topic: 'plan',
    patterns: [
      /\b(mon|ma|notre|votre|le|la) (plan|abonn?ement|forfait|offre|formule|souscription|licence|periode d essai) (actuel|actuelle|en cours|du cabinet|de mon cabinet|de notre cabinet)\b/,
      /\b(mon|ma|notre|votre) (abonn?ement|forfait|offre|formule|souscription|licence|periode d essai)\b/,
      // « mon plan », mais pas « mon plan d'action / de plaidoirie ».
      /\b(mon|notre|votre) plan\b(?! (d|de|du|des) )/,
      /\bplan d abonn?ement\b/,
      /\babonn?ement\b.{0,30}\b(actuel|en cours|du cabinet|expire|se termine|renouvel\w*)\b/,
      /\b(quand|date|jusqu a quand)\b.{0,30}\b(expire|fin|se termine|renouvel\w*)\b.{0,30}\b(abonn?ement|plan|forfait|essai|offre)\b/,
      /\b(abonn?ement|plan|forfait|essai|offre)\b.{0,20}\b(expire|se termine|prend fin)\b/,
    ],
  },
  {
    topic: 'modules',
    patterns: [
      /\b(inclus|incluse|compris|comprise|disponibles?)\b.{0,15}\b(dans|avec) (mon|ma|notre|votre|le|la) (plan|abonn?ement|offre|forfait|formule)\b/,
      /\b(mon|ma|notre|votre) (plan|abonn?ement|offre|forfait|formule) (inclut|comprend|permet|contient|couvre)\b/,
      /\b(modules?|fonctionnalites?) (inclus|incluses|compris|comprises)\b/,
    ],
  },
  {
    topic: 'quotas',
    patterns: [
      /\b(mes|nos|mon|notre|ma) (quotas?|limites?|consommation|credits?|requetes ia)\b/,
      /\bquotas?\b/,
      /\b(requetes?|questions?|demandes?) (ia |a l ia )?(restantes?|qu il me reste|qu il nous reste|disponibles? ce mois)\b/,
      /\bcombien de (requetes|questions|demandes)\b.{0,40}\b(reste|ia|assistant|ce mois|par mois)\b/,
      /\b(espace|stockage)\b.{0,20}\b(restant|utilise|disponible|occupe)\b/,
      /\b(limite|nombre maximum|maximum) de (collaborateurs|utilisateurs|clients|dossiers)\b/,
    ],
  },
  {
    topic: 'cabinet',
    patterns: [
      /\b(nom|code|identifiant) (de |du )?(mon |notre )?cabinet\b/,
      /\b(quel|c est quoi) (est )?(le nom de )?(mon|notre) cabinet\b/,
      /\bdans quel cabinet\b/,
    ],
  },
];

/** « mon rôle dans ce dossier » : question sur une affectation, pas sur le compte. */
const RECORD_ROLE =
  /\b(mon|ma) (role|fonction|poste)\b.{0,6}\b(dans|sur|pour) (le|ce|cette|l|la|les|un|une) (dossier|affaire|audience|procedure|diligence|tache|equipe du dossier)\b/;

/** « … et liste / montre … » : une autre demande suit (réponse en plusieurs parties). */
const FOLLOWED_BY_REQUEST =
  /\b(et|puis) (me |m |nous )?(donne|donner|liste|lister|affiche|afficher|montre|montrer|cree|creer|ajoute|ajouter|modifie|modifier|envoie|envoyer|prepare|preparer|redige|rediger|cherche|chercher)\b/;

/**
 * Sujets de la question quand elle porte sur l'utilisateur lui-même (compte,
 * rôle, droits, plan, quotas, cabinet). Tableau vide sinon.
 */
export function selfProfileTopics(question: string): SelfTopic[] {
  const normalized = normalizeAccessText(question);
  if (!normalized || normalized.length > 220) return [];
  if (FOLLOWED_BY_REQUEST.test(normalized) || RECORD_ROLE.test(normalized)) return [];
  const topics = SELF_PATTERNS
    .filter((entry) => entry.patterns.some((pattern) => pattern.test(normalized)))
    .map((entry) => entry.topic);
  if (isCapabilityQuestion(question)) topics.push('rights');
  // « ai-je la paie dans mon plan ? » : modules plutôt que plan seul.
  if (topics.includes('plan') && PLAN_MODULE_LABELS.some((m) => m.pattern.test(normalized)) && /\b(inclus|compris|dans|avec|ai.je|avons.nous|est.ce)\b/.test(normalized)) {
    topics.push('modules');
  }
  return [...new Set(topics)];
}

export function isSelfProfileQuestion(question: string): boolean {
  return selfProfileTopics(question).length > 0;
}

const LOOSE_TOPICS: Array<{ topic: SelfTopic; pattern: RegExp }> = [
  { topic: 'role', pattern: /\b(role|poste|fonction|profil)\b/ },
  { topic: 'plan', pattern: /\b(plan|abonn?ements?|forfait|offre|formule|essai|licence)\b/ },
  { topic: 'quotas', pattern: /\b(quotas?|limites?|consommation|requetes)\b/ },
  { topic: 'rights', pattern: /\b(droits?|permissions?|habilitations?|autorisations?)\b/ },
];

/**
 * Repli avant une demande de précision : une question à la première personne
 * qui évoque le compte (« mon abonement ? », « les droits que j'ai ») et
 * que la lecture n'a pas su traiter. Plus permissif que selfProfileTopics.
 */
export function looseSelfTopics(question: string): SelfTopic[] {
  const strict = selfProfileTopics(question);
  if (strict.length) return strict;
  const normalized = normalizeAccessText(question);
  if (!normalized || normalized.length > 220 || RECORD_ROLE.test(normalized)) return [];
  if (!/\b(mes|mon|ma|moi|je|j|nos|notre|me|m)\b/.test(normalized)) return [];
  return LOOSE_TOPICS.filter((entry) => entry.pattern.test(normalized)).map((entry) => entry.topic);
}

function capitalize(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

export function frDate(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function quotaText(quota: UserProfileQuota): string {
  const unit = quota.unit ? ` ${quota.unit}` : '';
  return quota.max === null ? `${quota.used}${unit} (illimité)` : `${quota.used}${unit} / ${quota.max}${unit}`;
}

function subscriptionLine(snapshot: UserProfileSnapshot): string {
  const sub = snapshot.subscription;
  if (!sub) return '';
  const status = SUBSCRIPTION_STATUS_LABELS[sub.status] ?? sub.status;
  const end = sub.isTrial ? sub.trialEndsAt ?? sub.endsAt : sub.endsAt;
  const parts = [`abonnement ${status}`];
  if (sub.cycle && !sub.isTrial) parts.push(CYCLE_LABELS[sub.cycle] ?? sub.cycle);
  if (end) {
    const days = sub.daysRemaining;
    const left = days === null ? '' : days >= 0 ? ` (${days} jour${days > 1 ? 's' : ''} restant${days > 1 ? 's' : ''})` : ' (échéance dépassée)';
    parts.push(`${sub.isTrial ? "fin d'essai le" : "jusqu'au"} ${frDate(end)}${left}`);
  } else if (!sub.isTrial) {
    parts.push('sans date de fin');
  }
  if (sub.autoRenew && !sub.isTrial) parts.push('renouvellement automatique');
  return parts.join(', ');
}

/**
 * Bloc ajouté aux prompts : `full` pour les réponses rédigées, `short` pour
 * la classification et le planificateur.
 */
export function renderUserProfileBlock(snapshot: UserProfileSnapshot | null | undefined, level: 'full' | 'short' = 'full'): string {
  if (!snapshot) return '';
  const lines: string[] = [];
  const who = [snapshot.name || `utilisateur n°${snapshot.userId ?? '?'}`, snapshot.position && `fonction : ${snapshot.position}`]
    .filter(Boolean)
    .join(', ');
  lines.push(`- Utilisateur : ${who}${snapshot.userId ? ` (id ${snapshot.userId})` : ''}`);
  lines.push(`- Profil d'accès : ${snapshot.roleName || 'non renseigné'}${snapshot.isAdmin ? ' (administrateur du cabinet, tous les droits)' : ''}`);
  if (!snapshot.isAdmin) {
    lines.push(
      level === 'full'
        ? `- Droits : ${snapshot.capabilities.map((c) => `${c.label} (${c.actions.join(', ')})`).join(' ; ') || 'aucun'}`
        : `- Modules accessibles : ${snapshot.capabilities.map((c) => c.label).join(', ') || 'aucun'}`,
    );
    if (snapshot.denied.length) lines.push(`- Non accessible avec ce rôle : ${snapshot.denied.join(', ')}`);
  }
  if (snapshot.cabinet) lines.push(`- Cabinet : ${snapshot.cabinet.name}`);
  if (snapshot.plan) {
    const excluded = snapshot.plan.excluded.length ? ` ; non inclus : ${snapshot.plan.excluded.join(', ')}` : '';
    lines.push(`- Plan : ${snapshot.plan.name} — inclut ${snapshot.plan.included.join(', ') || 'les modules de base'}${excluded}`);
    if (level === 'full') {
      const sub = subscriptionLine(snapshot);
      if (sub) lines.push(`- Abonnement : ${sub}`);
    }
  } else {
    lines.push('- Plan : aucun plan rattaché (pas de limite)');
  }
  if (level === 'full') {
    if (snapshot.quotas.length) lines.push(`- Utilisation : ${snapshot.quotas.map((q) => `${q.label} ${quotaText(q)}`).join(' ; ')}`);
    if (snapshot.ai) lines.push(`- Requêtes IA ce mois : ${quotaText({ label: '', used: snapshot.ai.used, max: snapshot.ai.max })}`);
  }
  return `CONTEXTE DE L'UTILISATEUR CONNECTÉ (fourni par l'application, fiable ; sers-t'en quand la question porte sur l'utilisateur, son rôle, ses droits, son cabinet ou son abonnement, sans le recopier inutilement) :
${lines.join('\n')}`;
}

/** Ligne d'identité pour la génération SQL (« mes dossiers », « mes audiences »). */
export function renderSqlUserLine(snapshot: UserProfileSnapshot | null | undefined): string {
  if (!snapshot?.userId) return '';
  return `UTILISATEUR CONNECTE : collaborateur id = ${snapshot.userId}${snapshot.name ? ` (${snapshot.name})` : ''} ; dans ce schema user.id = employee.id = ${snapshot.userId}.
Pour "mes dossiers", "mes audiences", "mes taches", "mes clients"... filtre sur les colonnes d'affectation du SCHEMA UTILE qui referencent un collaborateur ou un utilisateur (responsable, avocat, assigne, created_by...) avec la valeur ${snapshot.userId}. N'applique ce filtre que si la question parle de l'utilisateur lui-meme.`;
}

/** La question parle de l'utilisateur (« mes … », « je … ») : réponse propre à cet utilisateur. */
export function isFirstPersonQuestion(question: string): boolean {
  return /\b(mes|mon|ma|moi|je|j|me|m)\b/.test(normalizeAccessText(question));
}

const ROUTE_HINT = 'Le détail et les changements de formule se trouvent sur la page **Abonnement** (/abonnement).';

/**
 * Réponse directe (sans LLM) à une question sur l'utilisateur lui-même,
 * construite uniquement à partir de son profil réel. null si la question
 * ne porte pas sur l'utilisateur.
 */
export function buildSelfProfileAnswer(
  question: string,
  snapshot: UserProfileSnapshot,
  access: AccessProfile,
  forcedTopics?: SelfTopic[],
): string | null {
  const topics = forcedTopics?.length ? forcedTopics : selfProfileTopics(question);
  if (!topics.length) return null;
  const sections: string[] = [];

  if (topics.includes('identity') || topics.includes('role')) {
    const name = snapshot.name ? `**${snapshot.name}**` : 'connecté';
    const position = snapshot.position ? `, **${capitalize(snapshot.position)}**` : '';
    const cabinet = snapshot.cabinet ? ` au cabinet **${snapshot.cabinet.name}**` : '';
    const email = topics.includes('identity') && snapshot.email ? ` (${snapshot.email})` : '';
    const role = snapshot.roleName
      ? `Votre profil d'accès est **${snapshot.roleName}**${snapshot.isAdmin ? " : vous êtes administrateur du cabinet et disposez de tous les droits" : ''}.`
      : snapshot.isAdmin
        ? 'Vous êtes administrateur du cabinet et disposez de tous les droits.'
        : '';
    sections.push(`Vous êtes ${name}${email}${position}${cabinet}. ${role}`.trim());
    if (topics.includes('role') && !topics.includes('rights') && !snapshot.isAdmin) {
      const allowed = snapshot.capabilities.map((c) => c.label.toLowerCase());
      sections.push(
        [
          allowed.length ? `Ce profil vous donne accès à : ${allowed.join(', ')}.` : "Ce profil ne vous donne accès à aucun module du cabinet.",
          snapshot.denied.length ? `🔒 Non accessible : ${snapshot.denied.map((d) => d.toLowerCase()).join(', ')}.` : '',
          'Demandez « que puis-je faire ? » pour le détail de vos droits.',
        ].filter(Boolean).join('\n'),
      );
    }
  } else if (topics.includes('cabinet') && snapshot.cabinet) {
    sections.push(`Vous êtes connecté au cabinet **${snapshot.cabinet.name}** (code \`${snapshot.cabinet.code}\`).`);
  }

  if (topics.includes('rights')) sections.push(buildCapabilityAnswer(question, access));

  if (topics.includes('plan') || topics.includes('modules')) {
    if (!snapshot.plan) {
      sections.push("Aucun plan n'est rattaché à votre cabinet : aucune limite ne s'applique pour le moment.");
    } else {
      const plan = snapshot.plan;
      const lines = [`Votre cabinet est sur le plan **${plan.name}**${plan.price ? ` (${plan.price})` : ''}.`];
      const sub = subscriptionLine(snapshot);
      if (sub) lines.push(`${capitalize(sub)}.`);
      const normalized = normalizeAccessText(question);
      const asked = PLAN_MODULE_LABELS.filter((m) => m.pattern.test(normalized));
      if (topics.includes('modules') && asked.length) {
        for (const module of asked) {
          lines.push(plan.included.includes(module.label) ? `✅ ${capitalize(module.label)} est incluse dans votre plan.` : `🔒 ${capitalize(module.label)} n'est pas incluse dans votre plan.`);
        }
      } else {
        lines.push(`Modules inclus : ${plan.included.join(', ') || 'les modules de base'}.`);
        if (plan.excluded.length) lines.push(`Non inclus : ${plan.excluded.join(', ')}.`);
      }
      lines.push(ROUTE_HINT);
      sections.push(lines.join('\n'));
    }
  }

  if (topics.includes('quotas')) {
    const rows = [...snapshot.quotas];
    if (snapshot.ai) rows.push({ label: 'Requêtes IA ce mois', used: snapshot.ai.used, max: snapshot.ai.max });
    if (!rows.length) {
      sections.push('Je ne trouve pas les compteurs de votre cabinet pour le moment.');
    } else {
      const table = [
        '| Ressource | Utilisé | Limite |',
        '|---|---|---|',
        ...rows.map((q) => `| ${q.label} | ${q.used}${q.unit ? ` ${q.unit}` : ''} | ${q.max === null ? 'illimité' : `${q.max}${q.unit ? ` ${q.unit}` : ''}`} |`),
      ];
      const reset = snapshot.ai?.resetsAt ? `\n\nLe compteur de requêtes IA repart à zéro le ${frDate(snapshot.ai.resetsAt)}.` : '';
      sections.push(`Utilisation de votre cabinet${snapshot.plan ? ` (plan **${snapshot.plan.name}**)` : ''} :\n\n${table.join('\n')}${reset}`);
    }
  }

  return sections.length ? sections.join('\n\n') : null;
}

/** Résumé des droits pour l'instantané (réutilise les groupes de capacités). */
export function capabilitiesOf(access: AccessProfile): Pick<UserProfileSnapshot, 'capabilities' | 'denied'> {
  const { allowed, denied } = summarizeCapabilities(access);
  return { capabilities: allowed, denied };
}
