/**
 * Liaison « champ d'action → champ d'audience ».
 *
 * Une définition d'action peut déclarer, pour chacun de ses champs
 * personnalisés, dans quelle colonne de l'audience liée la valeur saisie doit
 * être recopiée à la clôture de l'action. La déclaration vit dans le JSON
 * `specific_fields_schema` déjà persisté sur la définition, donc sans migration :
 *
 *   specific_fields_schema.properties.<cle> = {
 *     type: 'string',
 *     label: 'Rapport d’audience',
 *     binding: { entity: 'audience', field: 'report_content' }
 *   }
 *
 * Module volontairement pur (aucun import d'entité ni de framework) : la liste
 * blanche est déclarée par nom de colonne, ce qui le rend testable unitairement
 * sans charger le graphe d'entités TypeORM.
 */

export type AudienceFieldKind =
  | 'longtext'
  | 'text'
  | 'integer'
  | 'date'
  | 'datetime';

export interface AudienceBindableField {
  /** Libellé présenté à l'administrateur et repris dans les messages d'erreur. */
  label: string;
  kind: AudienceFieldKind;
  /** Longueur maximale de la colonne, pour les varchar. */
  maxLength?: number;
}

/**
 * Seules ces colonnes de `audiences` peuvent être la cible d'une liaison.
 *
 * La liste blanche est la garantie de sécurité du mécanisme : la cible provient
 * d'une configuration utilisateur, on ne doit donc jamais pouvoir écrire une
 * clé primaire, un `tenant_id` ou une clé étrangère (vecteur d'IDOR
 * inter-cabinet). Sont également exclus les champs pilotés par les méthodes
 * métier de l'entité (`status`, `postponed_to`, `audience_date`,
 * `audience_time`) dont l'écriture brute contournerait le workflow de report et
 * les notifications, ainsi que `report_author_id` qui est une identité posée
 * côté serveur.
 */
export const AUDIENCE_BINDABLE_FIELDS: Readonly<
  Record<string, AudienceBindableField>
> = Object.freeze({
  report_content: {
    label: 'Rapport d’audience (procès-verbal)',
    kind: 'longtext',
  },
  decision: { label: 'Décision rendue', kind: 'longtext' },
  decision_text: { label: 'Texte complet de la décision', kind: 'longtext' },
  decision_notes: { label: 'Notes sur la décision', kind: 'longtext' },
  notes: { label: 'Notes de l’audience', kind: 'longtext' },
  outcome: { label: 'Issue de l’audience', kind: 'text', maxLength: 100 },
  decision_outcome: {
    label: 'Issue de la décision',
    kind: 'text',
    maxLength: 50,
  },
  judge_name: { label: 'Juge / magistrat', kind: 'text', maxLength: 255 },
  room: { label: 'Salle d’audience', kind: 'text', maxLength: 50 },
  duration_minutes: { label: 'Durée réelle (minutes)', kind: 'integer' },
  decision_date: { label: 'Date de la décision', kind: 'date' },
  report_date: { label: 'Date du rapport', kind: 'datetime' },
});

/**
 * Champs dont le report d'audience (`postponeAudienceWithManager`) est
 * propriétaire : lorsqu'une action clôture sur un report, ces cibles sont
 * ignorées pour ne pas écraser ce que le workflow de report vient d'écrire.
 */
export const POSTPONE_OWNED_AUDIENCE_FIELDS: ReadonlySet<string> = new Set([
  'report_content',
  'report_date',
  'report_author_id',
  'outcome',
  'status',
  'postponed_to',
  'notes',
  'audience_date',
  'audience_time',
]);

export interface AudienceBinding {
  /** Clé du champ dans `specific_data` de l'action. */
  sourceKey: string;
  /** Colonne de l'audience à alimenter. */
  target: string;
}

/**
 * Extrait les liaisons audience déclarées par un `specific_fields_schema`.
 *
 * Parcours tolérant : un schéma absent, malformé ou sans `properties` donne un
 * tableau vide plutôt qu'une erreur — une définition mal configurée ne doit
 * jamais empêcher la clôture d'une action. Les cibles hors liste blanche sont
 * écartées silencieusement, et une même colonne d'audience n'est alimentée que
 * par la première liaison rencontrée.
 */
export function collectAudienceBindings(
  schema: Record<string, unknown> | null | undefined,
): AudienceBinding[] {
  const properties = (schema as { properties?: unknown } | null)?.properties;
  if (
    !properties ||
    typeof properties !== 'object' ||
    Array.isArray(properties)
  )
    return [];

  const bindings: AudienceBinding[] = [];
  const seenTargets = new Set<string>();

  for (const [sourceKey, rawField] of Object.entries(
    properties as Record<string, unknown>,
  )) {
    if (!rawField || typeof rawField !== 'object' || Array.isArray(rawField))
      continue;
    const field = rawField as {
      binding?: { entity?: unknown; field?: unknown };
      audience_field?: unknown;
    };

    let target: string | null = null;
    if (field.binding && typeof field.binding === 'object') {
      if (field.binding.entity === 'audience') {
        target =
          typeof field.binding.field === 'string' ? field.binding.field : null;
      }
    } else if (typeof field.audience_field === 'string') {
      // Forme courte héritée, acceptée en lecture seule.
      target = field.audience_field;
    }

    if (!target) continue;
    if (!Object.prototype.hasOwnProperty.call(AUDIENCE_BINDABLE_FIELDS, target))
      continue;
    if (seenTargets.has(target)) continue;

    seenTargets.add(target);
    bindings.push({ sourceKey, target });
  }

  return bindings;
}

export interface AudiencePatchResult {
  patch: Record<string, unknown>;
  /** Messages en français, prêts à être remontés en `BadRequestException`. */
  issues: string[];
}

/**
 * Traduit les valeurs saisies sur l'action en valeurs typées pour l'audience.
 *
 * Une valeur absente ou vide est ignorée, jamais écrite : l'utilisateur qui
 * laisse un champ facultatif vide ne doit pas effacer un procès-verbal ou une
 * décision déjà consignés sur l'audience.
 */
export function buildAudiencePatch(
  bindings: readonly AudienceBinding[],
  specificData: Record<string, unknown> | null | undefined,
): AudiencePatchResult {
  const data = specificData ?? {};
  const patch: Record<string, unknown> = {};
  const issues: string[] = [];

  for (const binding of bindings) {
    const definition = AUDIENCE_BINDABLE_FIELDS[binding.target];
    if (!definition) continue;

    const raw = data[binding.sourceKey];
    if (raw === undefined || raw === null) continue;
    if (typeof raw === 'string' && !raw.trim()) continue;

    const coerced = coerceAudienceValue(raw, definition);
    if ('error' in coerced) {
      issues.push(`« ${definition.label} » : ${coerced.error}`);
      continue;
    }
    patch[binding.target] = coerced.value;
  }

  return { patch, issues };
}

type CoercionResult = { value: unknown } | { error: string };

function coerceAudienceValue(
  raw: unknown,
  definition: AudienceBindableField,
): CoercionResult {
  switch (definition.kind) {
    case 'longtext':
    case 'text': {
      const value = String(raw).trim();
      if (definition.maxLength && value.length > definition.maxLength) {
        // On refuse plutôt que de tronquer : il s'agit de contenu juridique.
        return {
          error: `la valeur dépasse ${definition.maxLength} caractères`,
        };
      }
      return { value };
    }
    case 'integer': {
      const value = Number(raw);
      if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0)
        return { error: 'un nombre entier positif est attendu' };
      return { value };
    }
    case 'date':
    case 'datetime': {
      if (
        typeof raw !== 'string' &&
        typeof raw !== 'number' &&
        !(raw instanceof Date)
      )
        return { error: 'une date est attendue' };
      const value =
        raw instanceof Date ? new Date(raw.getTime()) : new Date(raw);
      if (Number.isNaN(value.getTime()))
        return { error: 'la date est invalide' };
      if (definition.kind === 'date') value.setHours(0, 0, 0, 0);
      return { value };
    }
    default:
      return { error: 'type de champ non pris en charge' };
  }
}
