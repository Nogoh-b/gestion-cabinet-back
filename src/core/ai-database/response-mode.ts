// src/core/ai-database/response-mode.ts

/**
 * Mode de réponse affiché dans le déroulé du chat (« Mode : Aide · choisi
 * automatiquement ») et gardé avec la réponse. Les libellés reprennent ceux
 * du menu « / » de la saisie.
 */
export type ResponseModeCode =
  | 'read'
  | 'write'
  | 'chat'
  | 'knowledge'
  | 'help'
  | 'advice'
  | 'skill'
  | 'text';

/**
 * auto : décidé par l'assistant ; manual : mode choisi dans la saisie ou sur
 * la carte de choix ; fallback : changé en cours de route (lecture vide…).
 */
export type ResponseModeOrigin = 'auto' | 'manual' | 'fallback';

export interface ResponseMode {
  code: ResponseModeCode;
  label: string;
  origin: ResponseModeOrigin;
  /** Pourquoi ce mode (« question sur l'utilisation de l'application »). */
  reason?: string;
  /** Compétences mobilisées (compétence « # », actions d'un plan). */
  skills?: string[];
  /** Réponse en plusieurs parties : le mode de chacune, dans l'ordre. */
  parts?: ResponseMode[];
}

/** Mode d'une réponse en plusieurs parties : « Lire + Compétence », chaque partie gardée. */
export function composeResponseModes(parts: ResponseMode[]): ResponseMode | null {
  if (!parts.length) return null;
  if (parts.length === 1) return parts[0];
  const skills = [...new Set(parts.flatMap((part) => part.skills ?? []))];
  return {
    ...parts[0],
    label: parts.map((part) => part.label).join(' + '),
    reason: 'plusieurs demandes dans la même question',
    ...(skills.length > 0 && { skills }),
    parts,
  };
}

export const RESPONSE_MODE_LABELS: Record<ResponseModeCode, string> = {
  read: 'Lire',
  write: 'Écrire',
  chat: 'Conversation',
  knowledge: 'Base de connaissance',
  help: 'Aide',
  advice: 'Conseil',
  skill: 'Compétence',
  text: 'Rédaction',
};

const INTENT_TO_MODE: Record<string, ResponseModeCode> = {
  READ: 'read',
  DOCUMENT: 'read',
  WRITE: 'write',
  CONVERSATIONAL: 'chat',
  CHAT: 'chat',
  KNOWLEDGE: 'knowledge',
  HELP: 'help',
  ADVICE: 'advice',
  SKILL: 'skill',
  TEXT: 'text',
};

/** Mode correspondant à un événement `intent` du chat, ou null s'il est inconnu. */
export function describeResponseMode(
  intent: { type?: string; origin?: ResponseModeOrigin; reason?: string },
  requestedMode: string,
  skills: string[] = [],
): ResponseMode | null {
  const code = INTENT_TO_MODE[String(intent?.type ?? '').toUpperCase()];
  if (!code) return null;
  // Rédaction : toujours demandée explicitement. Compétence : choisie avec « # »,
  // sauf quand l'assistant la reconnaît dans la demande (origin « auto »).
  const origin: ResponseModeOrigin =
    code === 'text'
      ? 'manual'
      : code === 'skill'
        ? (intent.origin ?? 'manual')
        : (intent.origin ?? (requestedMode === 'auto' ? 'auto' : 'manual'));
  const uniqueSkills = [...new Set(skills.filter(Boolean))];
  return {
    code,
    label: RESPONSE_MODE_LABELS[code],
    origin,
    ...(intent.reason && { reason: intent.reason }),
    ...(uniqueSkills.length > 0 && { skills: uniqueSkills }),
  };
}

// ── Choix du mode quand l'assistant hésite ──────────────────────────────────

/** Classe d'intention renvoyée par la classification (cf. IntentDetectionService). */
export type IntentCandidate = 'READ' | 'WRITE' | 'HELP' | 'ADVICE' | 'CHAT';

/** Modes que l'utilisateur peut imposer (`intentMode` de la demande). */
export type ChoosableMode = 'read' | 'write' | 'chat' | 'knowledge' | 'help' | 'advice';

export interface ModeChoiceOption {
  /** Mode imposé à la question, ou « skill » pour relancer avec une compétence. */
  mode: ChoosableMode | 'skill';
  /** Code de la compétence (mode « skill »). */
  skill?: string;
  label: string;
  description: string;
}

const CANDIDATE_TO_MODE: Record<IntentCandidate, ChoosableMode> = {
  READ: 'read',
  WRITE: 'write',
  HELP: 'help',
  ADVICE: 'advice',
  CHAT: 'chat',
};

const CHOICE_DESCRIPTIONS: Record<ChoosableMode, string> = {
  read: 'Chercher la réponse dans les données du cabinet',
  write: 'Créer ou modifier des données (avec confirmation)',
  chat: 'Répondre avec mes connaissances (droit, culture générale)',
  knowledge: 'Répondre à partir de la base juridique de la plateforme',
  help: "Expliquer comment faire dans l'application",
  advice: 'Donner des conseils et les prochaines étapes',
};

export const MODE_CHOICE_MESSAGE =
  "Je ne suis pas certain de ce que vous attendez. Comment dois-je traiter votre demande ?";

/**
 * Options de la carte « Comment dois-je traiter votre demande ? » : les modes
 * envisagés par le classifieur, puis les compétences qui correspondent.
 */
export function buildModeChoiceOptions(
  candidates: IntentCandidate[],
  options: {
    knowledgeBase?: boolean;
    skills?: Array<{ code: string; label: string; description: string }>;
  } = {},
): ModeChoiceOption[] {
  const modes: ChoosableMode[] = [];
  for (const candidate of candidates) {
    const mode = CANDIDATE_TO_MODE[candidate];
    if (mode && !modes.includes(mode)) modes.push(mode);
  }
  // Base juridique de la plateforme pertinente : proposée à côté des connaissances.
  if (options.knowledgeBase && modes.includes('chat')) modes.push('knowledge');
  return [
    ...modes.map((mode) => ({
      mode,
      label: RESPONSE_MODE_LABELS[mode],
      description: CHOICE_DESCRIPTIONS[mode],
    })),
    ...(options.skills ?? []).map((skill) => ({
      mode: 'skill' as const,
      skill: skill.code,
      label: skill.label,
      description: skill.description,
    })),
  ];
}
