import type { AgentStep } from './agent-loop';

/**
 * Mémoire de travail de l'agent, propre à une conversation.
 *
 * Elle retient le sujet en cours (dossier, client, facture) et la dernière
 * liste affichée, pour que « ce client », « dessus », « la deuxième » ou
 * « sa prochaine audience » désignent le bon enregistrement d'une question à
 * l'autre. Elle est enregistrée avec chaque réponse de l'agent (métadonnées
 * du message) et relue au tour suivant.
 */

export interface WorkingMemory {
  dossier?: { numero: string; client?: string };
  client?: { nom: string; code?: string };
  facture?: { numero: string; dossier?: string };
  /** Collaborateur du cabinet en cours (« ajoute-le au dossier »). */
  collaborateur?: { nom: string };
  /** Dernière liste affichée, dans l'ordre (« la deuxième » = elements[1]). */
  liste?: { type: ListType; elements: string[] };
}

export type ListType =
  | 'factures'
  | 'dossiers'
  | 'clients'
  | 'audiences'
  | 'actions'
  | 'paiements'
  | 'elements_facturables'
  | 'collaborateurs';

/** Enregistrement joint par l'utilisateur (@mention ou fiche ouverte), résolu en numéro métier. */
export interface ResolvedReference {
  type: 'dossier' | 'client' | 'facture' | 'audience' | 'collaborateur';
  source: 'page' | 'mention';
  /** Numéro métier ou nom, utilisable par les outils. */
  reference: string;
  /** Compléments lisibles (client du dossier, dossier de la facture…). */
  details?: string;
  /** Dossier lié (pour une facture ou une audience). */
  dossier?: string;
  client?: string;
}

const text = (value: unknown) => (typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '');
const MAX_LIST = 15;

function lignes(step: AgentStep): Array<Record<string, unknown>> {
  const rows = (step.result as any)?.lignes;
  return Array.isArray(rows) ? rows : [];
}

/** Liste affichée par un outil, si c'en est une. */
function listOf(step: AgentStep): WorkingMemory['liste'] | undefined {
  const rows = lignes(step);
  if (!rows.length) return undefined;
  const pick = (type: ListType, key: string) => {
    const elements = rows.map((row) => text(row[key])).filter(Boolean).slice(0, MAX_LIST);
    return elements.length ? { type, elements } : undefined;
  };
  switch (step.name) {
    case 'factures':
      return pick('factures', 'numero');
    case 'dossiers':
      return pick('dossiers', 'dossier_number');
    case 'debiteurs':
      return pick('clients', 'client');
    case 'audiences':
      return pick('audiences', 'dossier');
    case 'actions':
      return pick('actions', 'action');
    case 'paiements':
      return pick('paiements', 'facture');
    case 'elements_a_facturer':
      return pick('elements_facturables', 'element');
    case 'equipe':
      return pick('collaborateurs', 'collaborateur');
    default:
      return undefined;
  }
}

/**
 * Mémoire après un tour : les références jointes par l'utilisateur, puis ce
 * que les outils ont lu (synthèse d'un dossier, liste, filtre sur un
 * client…). Le plus récent l'emporte.
 */
export function updateMemory(
  previous: WorkingMemory | undefined,
  references: ResolvedReference[],
  steps: AgentStep[],
): WorkingMemory {
  const memory: WorkingMemory = { ...(previous ?? {}) };

  // Fiche ouverte d'abord, mention @ explicite ensuite (elle l'emporte) ; le
  // dossier d'une facture ou d'une audience ne remplace pas un dossier joint.
  const ordered = [...references].sort((a, b) => (a.source === b.source ? 0 : a.source === 'page' ? -1 : 1));
  const dossierJoint = references.some((ref) => ref.type === 'dossier');
  for (const ref of ordered) {
    if (ref.type === 'dossier') memory.dossier = { numero: ref.reference, ...(ref.client && { client: ref.client }) };
    if (ref.type === 'client') memory.client = { nom: ref.reference };
    if (ref.type === 'facture') memory.facture = { numero: ref.reference, ...(ref.dossier && { dossier: ref.dossier }) };
    if (ref.type === 'collaborateur') memory.collaborateur = { nom: ref.reference };
    if ((ref.type === 'facture' || ref.type === 'audience') && ref.dossier && !dossierJoint) {
      memory.dossier = { numero: ref.dossier, ...(ref.client && { client: ref.client }) };
    }
  }

  for (const step of steps) {
    const args = step.args ?? {};
    const result = (step.result ?? {}) as Record<string, any>;
    if (result.erreur || result.introuvable) continue;

    if (step.name === 'synthese_dossier' && result.identite) {
      const identite = result.identite as Record<string, unknown>;
      memory.dossier = { numero: text(identite.dossier_number), ...(text(identite.client) && { client: text(identite.client) }) };
      if (text(identite.client)) memory.client = { nom: text(identite.client), ...(text(identite.code_client) && { code: text(identite.code_client) }) };
      continue;
    }

    const rows = lignes(step);
    // Filtre explicite sur un dossier ou un client : il devient le sujet.
    if (text(args.dossier) && rows.length) {
      const client = text(rows[0].client);
      memory.dossier = { numero: text(args.dossier), ...(client && { client }) };
    }
    if (text(args.client) && rows.length) {
      memory.client = { nom: text(rows[0].client) || text(args.client) };
    }
    // Dossiers d'un collaborateur, ou un seul collaborateur lu : « il », « lui ».
    if (step.name === 'dossiers' && text(args.membre)) memory.collaborateur = { nom: text(args.membre) };
    if (step.name === 'equipe' && rows.length === 1 && text(rows[0].collaborateur)) {
      memory.collaborateur = { nom: text(rows[0].collaborateur) };
    }
    // Une seule facture lue : c'est « cette facture ».
    if (step.name === 'factures' && rows.length === 1 && text(rows[0].numero)) {
      memory.facture = { numero: text(rows[0].numero), ...(text(rows[0].dossier) && { dossier: text(rows[0].dossier) }) };
    }
    // Un seul client débiteur demandé (« qui nous doit le plus ») : « ce client ».
    if (step.name === 'debiteurs' && rows.length && text(rows[0].client)) {
      memory.client = { nom: text(rows[0].client), ...(text(rows[0].code_client) && { code: text(rows[0].code_client) }) };
    }
    if (step.name === 'chercher') {
      const found = result as Record<string, Array<Record<string, unknown>>>;
      if (found.dossiers?.length === 1) memory.dossier = { numero: text(found.dossiers[0].dossier_number), ...(text(found.dossiers[0].client) && { client: text(found.dossiers[0].client) }) };
      if (found.clients?.length === 1) memory.client = { nom: text(found.clients[0].client), ...(text(found.clients[0].code_client) && { code: text(found.clients[0].code_client) }) };
      if (found.factures?.length === 1) memory.facture = { numero: text(found.factures[0].numero) };
    }

    const list = listOf(step);
    if (list && list.elements.length > 1) memory.liste = list;
  }
  return memory;
}

/** Fiche sur laquelle porte une réponse de l'agent. */
export interface TurnSubject {
  type: 'dossier' | 'client' | 'facture';
  /** Numéro métier, code client ou nom. */
  reference: string;
}

const MAX_SUBJECTS = 6;
const LIST_SUBJECTS: Partial<Record<ListType, TurnSubject['type']>> = {
  factures: 'facture',
  dossiers: 'dossier',
  clients: 'client',
  audiences: 'dossier',
  paiements: 'facture',
};

/**
 * Fiches sur lesquelles porte la réponse de CE tour (pas les tours
 * précédents) : le sujet (dossier, client, facture) d'abord, puis les
 * premiers éléments des listes lues. Elles deviennent les enregistrements
 * cités par la réponse : actions recommandées, compétence suivante d'un
 * enchaînement (« prépare-lui… »), demandes de suivi.
 */
export function turnSubjects(references: ResolvedReference[], steps: AgentStep[]): TurnSubject[] {
  const subjects: TurnSubject[] = [];
  const add = (type: TurnSubject['type'], reference: string) => {
    const value = text(reference);
    if (!value || subjects.some((s) => s.type === type && s.reference.toLowerCase() === value.toLowerCase())) return;
    subjects.push({ type, reference: value });
  };
  const memory = updateMemory(undefined, references, steps);
  if (memory.dossier?.numero) add('dossier', memory.dossier.numero);
  if (memory.facture?.numero) add('facture', memory.facture.numero);
  if (memory.client) add('client', memory.client.code || memory.client.nom);

  for (const step of steps) {
    const result = (step.result ?? {}) as Record<string, any>;
    if (result.erreur || result.introuvable) continue;
    // Point du jour : audiences, retards et factures à relancer, dans cet ordre.
    if (step.name === 'point_du_jour') {
      const part = (key: string) => (Array.isArray(result[key]?.lignes) ? (result[key].lignes as Array<Record<string, unknown>>) : []);
      part('audiences_a_venir').slice(0, 2).forEach((row) => add('dossier', text(row.dossier)));
      part('actions_en_retard').slice(0, 2).forEach((row) => add('dossier', text(row.dossier)));
      part('factures_a_relancer').slice(0, 2).forEach((row) => add('facture', text(row.numero)));
      continue;
    }
    const list = listOf(step);
    const type = list && LIST_SUBJECTS[list.type];
    if (list && type) list.elements.slice(0, 3).forEach((element) => add(type, element));
  }
  return subjects.slice(0, MAX_SUBJECTS);
}

/** Contexte de travail présenté au modèle, avant la question. */
export function renderWorkingContext(references: ResolvedReference[], memory: WorkingMemory | undefined): string {
  const lines: string[] = [];
  const page = references.filter((ref) => ref.source === 'page');
  const mentions = references.filter((ref) => ref.source === 'mention');
  const describe = (ref: ResolvedReference) =>
    `${ref.type} ${ref.reference}${ref.details ? ` (${ref.details})` : ''}`;
  if (mentions.length) lines.push(`- Mentionné par l'utilisateur (@) : ${mentions.map(describe).join(' ; ')}`);
  if (page.length) lines.push(`- Fiche ouverte à l'écran : ${page.map(describe).join(' ; ')}`);
  if (memory?.dossier?.numero) {
    lines.push(`- Dossier en cours dans la conversation : ${memory.dossier.numero}${memory.dossier.client ? ` (client ${memory.dossier.client})` : ''}`);
  }
  if (memory?.client?.nom) lines.push(`- Client en cours : ${memory.client.nom}${memory.client.code ? ` (${memory.client.code})` : ''}`);
  if (memory?.facture?.numero) {
    lines.push(`- Facture en cours : ${memory.facture.numero}${memory.facture.dossier ? ` (dossier ${memory.facture.dossier})` : ''}`);
  }
  if (memory?.collaborateur?.nom) lines.push(`- Collaborateur en cours : ${memory.collaborateur.nom}`);
  if (memory?.liste?.elements.length) {
    lines.push(
      `- Dernière liste affichée (${memory.liste.type}) : ${memory.liste.elements.map((element, i) => `${i + 1}. ${element}`).join(', ')}`,
    );
  }
  return lines.length ? `CONTEXTE DE TRAVAIL :\n${lines.join('\n')}` : '';
}

/** Mémoire relue dans les métadonnées du dernier message (forme tolérante). */
export function readMemory(value: unknown): WorkingMemory | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Record<string, any>;
  const memory: WorkingMemory = {};
  if (text(raw.dossier?.numero)) memory.dossier = { numero: text(raw.dossier.numero), ...(text(raw.dossier.client) && { client: text(raw.dossier.client) }) };
  if (text(raw.client?.nom)) memory.client = { nom: text(raw.client.nom), ...(text(raw.client.code) && { code: text(raw.client.code) }) };
  if (text(raw.facture?.numero)) memory.facture = { numero: text(raw.facture.numero), ...(text(raw.facture.dossier) && { dossier: text(raw.facture.dossier) }) };
  if (text(raw.collaborateur?.nom)) memory.collaborateur = { nom: text(raw.collaborateur.nom) };
  if (Array.isArray(raw.liste?.elements) && typeof raw.liste?.type === 'string') {
    const elements = raw.liste.elements.map(text).filter(Boolean).slice(0, MAX_LIST);
    if (elements.length) memory.liste = { type: raw.liste.type, elements };
  }
  return Object.keys(memory).length ? memory : undefined;
}
