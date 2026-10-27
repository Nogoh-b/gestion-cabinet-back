// src/core/ai-database/answer-plan.ts
//
// Une question qui enchaîne plusieurs demandes (« quel est mon rôle et liste
// mes dossiers », « résume le dossier puis prépare un WhatsApp au client »)
// reçoit une seule réponse en plusieurs parties : chaque partie suit son
// mode (Lire, Aide, compétence…), dans l'ordre de la question.

export type AnswerStepKind = 'READ' | 'WRITE' | 'HELP' | 'ADVICE' | 'CHAT' | 'SKILL' | 'PROFILE';

export interface AnswerStep {
  kind: AnswerStepKind;
  /** Partie de la question traitée par cette étape. */
  question: string;
  /** Compétence (étape SKILL). */
  skill?: string;
}

export const MAX_ANSWER_STEPS = 3;

/** Séparateur affiché entre deux parties de la réponse. */
export const ANSWER_PART_SEPARATOR = '\n\n---\n\n';

const LETTER = "[a-zàâäçéèêëîïôöùûüÿœ]";

/** Verbes qui ouvrent une nouvelle demande après « et » (« … et prépare un WhatsApp »). */
const REQUEST_VERBS = [
  'pr[ée]pare', 'r[ée]dige', 'envoie', '[ée]cris', 'fais', 'g[ée]n[èeé]re', 'calcule', 'explique',
  'dis', 'donne', 'liste', 'montre', 'affiche', 'cr[ée]e', 'ajoute', 'programme', 'traduis',
  'r[ée]sume', 'analyse', 'conseille', 'propose', 'relance', 'enregistre', 'modifie', 'supprime',
  'cherche', 'trouve', '[ée]value', 'v[ée]rifie', 'indique', 'rappelle',
];

const PRONOUN = "(?:(?:me|moi|nous|lui|leur|le|la|les)\\s+|m['’]|l['’])?";

/**
 * Points de coupure : « puis », « ensuite », « et ensuite », « après quoi »,
 * et « et » / « , » suivis d'un verbe de demande. Les autres « et »
 * (« les factures et les paiements ») ne coupent pas.
 */
const SPLIT = new RegExp(
  // « puis-je » n'est pas un connecteur.
  `\\s*(?:[,;]\\s*)?(?:\\b(?:et\\s+)?(?:puis(?!\\s*-?\\s*je\\b)|ensuite|apr[èe]s\\s+quoi|enfin)\\b,?|\\bet\\s+(?=${PRONOUN}(?:${REQUEST_VERBS.join('|')})${LETTER}*\\b)|[,;]\\s*(?=${PRONOUN}(?:${REQUEST_VERBS.join('|')})${LETTER}*\\b))\\s*`,
  'giu',
);

/** Une demande composée contient-elle un connecteur (« et », « puis »…) ? */
export function hasRequestConnector(question: string): boolean {
  return /\b(et|puis|ensuite|enfin)\b/i.test(question);
}

/** Découpe la question en demandes successives (au plus 3) ; [question] si rien à couper. */
export function splitRequests(question: string): string[] {
  const text = String(question ?? '').trim();
  if (!text || text.length > 600) return [text];
  const parts = text
    .split(SPLIT)
    .map((part) => part.trim().replace(/^[,;.\s]+|[,;\s]+$/g, ''))
    .filter((part) => part.split(/\s+/).length >= 2);
  return parts.length >= 2 && parts.length <= MAX_ANSWER_STEPS ? parts : [text];
}

/**
 * Plan de réponse déterministe : chaque demande découpée est classée par
 * `classify` (null = inconnue). Retenu seulement si toutes les parties sont
 * reconnues et qu'au moins deux natures différentes se suivent ; deux
 * lectures consécutives restent une seule lecture.
 */
export function planAnswer(
  question: string,
  classify: (segment: string) => { kind: AnswerStepKind; skill?: string } | null,
): AnswerStep[] | null {
  const segments = splitRequests(question);
  if (segments.length < 2) return null;
  const steps: AnswerStep[] = [];
  for (const segment of segments) {
    const verdict = classify(segment);
    if (!verdict) return null;
    const last = steps[steps.length - 1];
    if (last && last.kind === verdict.kind && last.skill === verdict.skill && verdict.kind !== 'SKILL') {
      last.question = `${last.question} et ${segment}`;
      continue;
    }
    steps.push({ kind: verdict.kind, question: segment, ...(verdict.skill && { skill: verdict.skill }) });
  }
  if (steps.length < 2) return null;
  return orderSteps(steps);
}

/**
 * Plan donné par le classifieur (« READ+SKILL:whatsapp ») pour les morceaux
 * que le découpage n'a pas su classer : retenu seulement quand le découpage
 * donne autant de morceaux que de parties (chaque partie a sa question).
 */
export function planFromParts(
  question: string,
  parts: Array<{ kind: AnswerStepKind; skill?: string }>,
): AnswerStep[] | null {
  const segments = splitRequests(question);
  if (parts.length < 2 || segments.length !== parts.length) return null;
  const steps = parts.map((part, index) => ({
    kind: part.kind,
    question: segments[index],
    ...(part.skill && { skill: part.skill }),
  }));
  return orderSteps(steps);
}

/**
 * Une écriture (plan à confirmer) se termine par une carte de confirmation :
 * elle passe en dernier, les autres parties gardent leur ordre.
 */
function orderSteps(steps: AnswerStep[]): AnswerStep[] {
  const writes = steps.filter((step) => step.kind === 'WRITE');
  if (writes.length > 1) return steps.filter((step) => step.kind !== 'WRITE').concat(writes[0]);
  return [...steps.filter((step) => step.kind !== 'WRITE'), ...writes];
}

/** Mode imposé à chaque partie (`intentMode` de la sous-demande). */
export function stepIntentMode(kind: AnswerStepKind): string {
  switch (kind) {
    case 'READ': return 'read';
    case 'WRITE': return 'write';
    case 'HELP': return 'help';
    case 'ADVICE': return 'advice';
    case 'CHAT': return 'chat';
    default: return 'auto';
  }
}
