import { LegalKnowledgeMatch } from './legal-knowledge';

/**
 * Indices calculés localement (sans LLM) avant la classification du mode
 * auto : ils disent si la réponse exige les données du cabinet, la base
 * juridique de la plateforme ou seulement les connaissances du modèle.
 */
export interface SourceSignals {
  /** Numéro métier cité (« DOS-2026-0039 », « FAC-2026/12 »…). */
  recordReference: string | null;
  /** Possessif, démonstratif, période, comptage : la question vise le cabinet. */
  cabinetAnchor: boolean;
  /** Pronom de suivi (« celle-ci », « parmi eux ») : porte sur un résultat affiché. */
  followUp: boolean;
  /** Vocabulaire métier (dossier, facture, audience…). */
  domainKeyword: boolean;
  /** Formulation d'une question de droit (délais, procédure, article, OHADA…). */
  legalMarkers: boolean;
  /** Verbe d'écriture explicite (créer, ajouter, modifier…). */
  writeVerb: boolean;
  /** Meilleur extrait de la base juridique de la plateforme, s'il y en a un. */
  legalKb: {
    coverage: number;
    matchedTerms: number;
    documents: string[];
  } | null;
  /** Page de l'application d'où la question est posée. */
  pathname?: string;
}

export type AnswerSource = 'db' | 'legal_kb' | 'model';

/** Couverture minimale des termes de la question pour qu'un extrait compte. */
export const STRONG_LEGAL_KB_COVERAGE = 0.6;

/**
 * Code métier avec au moins un chiffre et un préfixe de 2 lettres ou plus :
 * « DOS-2026-0039 », « FAC/2026/12 ». « L-121 » (article de code) ou
 * « 2016/007 » (numéro de loi) n'en sont pas.
 */
const RECORD_REFERENCE =
  /(?<![\w-])([A-Za-z]{2,8}(?:[-_/][A-Za-z0-9]{1,10}){1,4})(?![\w-])/g;

export function extractRecordReference(question: string): string | null {
  for (const match of question.matchAll(RECORD_REFERENCE)) {
    if (/\d/.test(match[1])) return match[1];
  }
  return null;
}

export function summarizeLegalMatches(
  matches: LegalKnowledgeMatch[],
): SourceSignals['legalKb'] {
  const best = matches.reduce<LegalKnowledgeMatch | null>(
    (top, match) => (!top || match.coverage > top.coverage ? match : top),
    null,
  );
  if (!best) return null;
  const documents = [
    ...new Set(
      matches
        .filter((match) => match.coverage >= STRONG_LEGAL_KB_COVERAGE)
        .map((match) => match.document_name),
    ),
  ];
  return {
    coverage: best.coverage,
    matchedTerms: best.matched_terms,
    documents,
  };
}

export function isStrongLegalKb(signals: SourceSignals): boolean {
  return (
    !!signals.legalKb &&
    signals.legalKb.coverage >= STRONG_LEGAL_KB_COVERAGE &&
    signals.legalKb.matchedTerms >= 2
  );
}

export function isAnchoredInCabinet(signals: SourceSignals): boolean {
  return !!signals.recordReference || signals.cabinetAnchor || signals.followUp;
}

/**
 * Question de connaissance : rien ne la rattache aux données du cabinet et
 * elle a la forme d'une question de droit, ou la base juridique y répond.
 * Sert aux replis (lecture vide, classifieur muet) et à ne pas lancer de
 * brouillon SQL pour rien.
 */
export function isKnowledgeQuestion(signals: SourceSignals): boolean {
  return (
    !isAnchoredInCabinet(signals) &&
    !signals.writeVerb &&
    (signals.legalMarkers || isStrongLegalKb(signals))
  );
}

/**
 * La base a peu de chances d'être utile : question de connaissance, ou
 * question sans ancrage ni vocabulaire métier. Le classifieur muet y répond
 * par les connaissances et le brouillon SQL n'y est pas lancé.
 */
export function isUnlikelyDatabaseQuestion(signals: SourceSignals): boolean {
  return (
    isKnowledgeQuestion(signals) ||
    (!isAnchoredInCabinet(signals) &&
      !signals.domainKeyword &&
      !signals.writeVerb)
  );
}

/**
 * Assez net pour répondre par les connaissances sans appeler le classifieur :
 * la base juridique couvre la question et aucun vocabulaire métier ne la
 * tire vers les données (« clients débiteurs » reste au classifieur).
 */
export function isDecisiveKnowledgeRoute(signals: SourceSignals): boolean {
  return (
    isKnowledgeQuestion(signals) &&
    isStrongLegalKb(signals) &&
    (signals.legalMarkers || !signals.domainKeyword)
  );
}

/** Sources mobilisées par une réponse, selon l'intention retenue. */
export function answerSources(
  intent: string,
  signals: SourceSignals | null | undefined,
): AnswerSource[] {
  const kb =
    !!signals?.legalKb && (signals.legalMarkers || isStrongLegalKb(signals));
  if (intent === 'READ')
    return kb ? ['db', 'legal_kb', 'model'] : ['db', 'model'];
  if (intent === 'CONVERSATIONAL' || intent === 'ADVICE') {
    return signals?.legalKb ? ['legal_kb', 'model'] : ['model'];
  }
  return [];
}

/** Indices lisibles par le classifieur LLM. */
export function describeSignals(signals: SourceSignals): string {
  const lines: string[] = [];
  if (signals.recordReference) {
    lines.push(
      `- Numéro d'enregistrement cité (${signals.recordReference}) : la réponse exige les données du cabinet.`,
    );
  }
  if (signals.followUp) {
    lines.push(
      '- La demande renvoie à un résultat déjà affiché dans la conversation.',
    );
  }
  if (signals.cabinetAnchor && !signals.recordReference) {
    lines.push(
      '- La demande vise le cabinet (possessif, démonstratif, période ou comptage).',
    );
  }
  if (!isAnchoredInCabinet(signals)) {
    lines.push(
      '- Aucun ancrage dans les données du cabinet (ni numéro, ni possessif, ni période).',
    );
  }
  if (signals.legalMarkers) {
    lines.push(
      '- Formulation de question de droit (délai, procédure, texte, définition…).',
    );
  }
  if (isStrongLegalKb(signals)) {
    const names = signals.legalKb!.documents.slice(0, 2).join(', ');
    lines.push(
      `- La base juridique de la plateforme contient des extraits qui y répondent${names ? ` (${names})` : ''}.`,
    );
  }
  if (signals.pathname) {
    lines.push(`- Page ouverte dans l'application : ${signals.pathname}.`);
  }
  return lines.join('\n');
}
