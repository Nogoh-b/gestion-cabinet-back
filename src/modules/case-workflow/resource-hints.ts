/**
 * CONSEILS DE FICHES EN FIN D'ACTION — rappellent, au moment de terminer une
 * action, les fiches liées à créer ou à mettre à jour (audience à reporter,
 * document rédigé à classer, dossier à compléter…). Le cabinet peut les
 * redéfinir par type d'action (`action_definitions.resource_hints`) ; sinon
 * les valeurs par défaut ci-dessous s'appliquent aux actions du catalogue.
 */

export const RESOURCE_HINT_TYPES = [
  'audience',
  'document',
  'diligence',
  'dossier',
] as const;
export type ResourceHintType = (typeof RESOURCE_HINT_TYPES)[number];

export const RESOURCE_HINT_EFFECTS = ['create', 'update'] as const;
export type ResourceHintEffect = (typeof RESOURCE_HINT_EFFECTS)[number];

export interface ResourceHint {
  type: ResourceHintType;
  effect: ResourceHintEffect;
  message: string;
  /** Codes de résultat qui déclenchent le conseil (tous si absent). */
  when_results?: string[];
}

const hint = (
  type: ResourceHintType,
  effect: ResourceHintEffect,
  message: string,
  when_results?: string[],
): ResourceHint => ({
  type,
  effect,
  message,
  ...(when_results ? { when_results } : {}),
});

const DRAFTED_DOCUMENT = hint(
  'document',
  'create',
  'Ajoutez le document rédigé au dossier.',
);

export const DEFAULT_RESOURCE_HINTS: Record<string, ResourceHint[]> = {
  PREPARE_HEARING: [
    hint(
      'audience',
      'update',
      'Complétez l’audience préparée (pièces, observations).',
    ),
  ],
  ATTEND_HEARING: [
    hint(
      'audience',
      'update',
      'Reportez le déroulement sur l’audience (tenue, renvoi, délibéré).',
    ),
  ],
  WRITE_HEARING_REPORT: [
    hint(
      'audience',
      'update',
      'Reportez le résultat sur la fiche de l’audience.',
    ),
    hint(
      'audience',
      'create',
      'Créez l’audience de renvoi à la nouvelle date.',
      ['POSTPONED'],
    ),
  ],
  PROCESS_POSTPONED_HEARING: [
    hint('audience', 'create', 'Créez l’audience à la date de renvoi.', [
      'RESCHEDULED',
    ]),
  ],
  EXECUTE_HEARING_FOLLOW_UP: [
    hint(
      'diligence',
      'create',
      'Planifiez les diligences décidées à l’audience.',
    ),
  ],
  SEIZE_JURISDICTION: [
    hint(
      'dossier',
      'update',
      'Renseignez la juridiction saisie sur le dossier.',
    ),
    hint('audience', 'create', 'Si une première audience est fixée, créez-la.'),
  ],
  FILE_PROCEDURAL_ACT: [
    hint(
      'document',
      'create',
      'Ajoutez l’acte déposé (avec le cachet du greffe).',
      ['FILED'],
    ),
    hint('audience', 'create', 'Si une date d’audience est fixée, créez-la.', [
      'FILED',
    ]),
  ],
  ENROLL_PROCEDURAL_ACT: [
    hint('audience', 'create', 'Si une date d’audience est fixée, créez-la.'),
  ],
  SIGN_DOCUMENT: [
    hint(
      'document',
      'update',
      'Mettez à jour le document signé (version, statut).',
      ['SIGNED'],
    ),
  ],
  VALIDATE_DOCUMENT: [
    hint('document', 'update', 'Mettez à jour le statut du document validé.'),
  ],
  FINALIZE_DOCUMENT: [
    hint(
      'document',
      'update',
      'Remplacez le projet par la version définitive.',
    ),
  ],
  PREPARE_DOCUMENT_DRAFT: [DRAFTED_DOCUMENT],
  DRAFT_PROCEDURAL_DOCUMENT: [DRAFTED_DOCUMENT],
  DRAFT_FORMAL_LETTER: [DRAFTED_DOCUMENT],
  DRAFT_AGREEMENT: [DRAFTED_DOCUMENT],
  DRAFT_SETTLEMENT_PROTOCOL: [DRAFTED_DOCUMENT],
  PREPARE_PLEADING: [DRAFTED_DOCUMENT],
  REQUEST_MISSING_DOCUMENT: [
    hint('document', 'create', 'Ajoutez la pièce reçue au dossier.', [
      'RECEIVED',
    ]),
  ],
  RECEIVE_AND_CLASSIFY_EVIDENCE: [
    hint('document', 'create', 'Ajoutez les pièces reçues au dossier.'),
  ],
  NOTIFY_DECISION: [
    hint('document', 'create', 'Ajoutez la décision notifiée au dossier.'),
  ],
  UPDATE_CASE_DATA: [
    hint('dossier', 'update', 'Modifiez les informations du dossier.'),
  ],
  FOLLOW_UP_REGISTRY: [
    hint('diligence', 'create', 'Planifiez la prochaine relance.', [
      'FOLLOW_UP_REQUIRED',
    ]),
  ],
  FOLLOW_UP_CONTACT: [
    hint('diligence', 'create', 'Planifiez la prochaine relance.', [
      'FOLLOW_UP_REQUIRED',
    ]),
  ],
};

/** Nettoie une liste reçue (API ou IA) : types/effets connus, message requis. */
export function sanitizeResourceHints(value: unknown): ResourceHint[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const hints: ResourceHint[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const entry = raw as Record<string, unknown>;
    const type = String(entry.type ?? '') as ResourceHintType;
    const effect = String(entry.effect ?? '') as ResourceHintEffect;
    const message = String(entry.message ?? '')
      .trim()
      .slice(0, 300);
    if (!RESOURCE_HINT_TYPES.includes(type)) continue;
    if (!RESOURCE_HINT_EFFECTS.includes(effect)) continue;
    if (!message) continue;
    const key = `${type}:${effect}:${message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const whenResults = Array.isArray(entry.when_results)
      ? entry.when_results.map(String).filter(Boolean)
      : [];
    hints.push(
      whenResults.length
        ? { type, effect, message, when_results: whenResults }
        : { type, effect, message },
    );
  }
  return hints.slice(0, 10);
}

/** Conseils effectifs d'une définition : ceux du cabinet, sinon les défauts. */
export function resourceHintsFor(
  definition:
    | { code?: string | null; resource_hints?: unknown }
    | null
    | undefined,
): ResourceHint[] {
  if (!definition) return [];
  if (Array.isArray(definition.resource_hints)) {
    return sanitizeResourceHints(definition.resource_hints);
  }
  return DEFAULT_RESOURCE_HINTS[String(definition.code ?? '')] ?? [];
}
