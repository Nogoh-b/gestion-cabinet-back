/**
 * Liens d'une action de dossier vers ses ressources, tels que l'IA peut les
 * exprimer dans un plan d'écriture. Même modèle que le formulaire manuel
 * (DossierWorkspacePage) : documents et audiences en INPUT, actions
 * précédentes en DEPENDS_ON.
 */
import { comparableKey, matchEnumValue } from 'src/core/ai-database/write/lenient-values';
import { ActionLinkRole } from '../case-workflow.enums';

export type LinkKind = 'documents' | 'audiences' | 'previous_actions';

export const LINK_KINDS: LinkKind[] = ['documents', 'audiences', 'previous_actions'];

export interface ActionLink {
  id: number | string;
  role: ActionLinkRole;
}

/** Élément brut fourni par le LLM : id, nom, date ou `{ id, role }`. */
export interface RawLink {
  ref: string;
  role?: unknown;
}

/** Clés acceptées pour chaque type de lien (le LLM varie ses formulations). */
export const LINK_ALIASES: Record<LinkKind, string[]> = {
  documents: ['documents', 'document_ids', 'documents_ids', 'document', 'pieces', 'linked_documents'],
  audiences: ['audiences', 'audience_ids', 'audiences_ids', 'audience', 'linked_audiences'],
  previous_actions: [
    'previous_actions',
    'previous_action_ids',
    'previous_action',
    'depends_on',
    'dependencies',
    'actions_precedentes',
  ],
};

export const DEFAULT_LINK_ROLE: Record<LinkKind, ActionLinkRole> = {
  documents: ActionLinkRole.INPUT,
  audiences: ActionLinkRole.INPUT,
  previous_actions: ActionLinkRole.DEPENDS_ON,
};

/** Table des enregistrements créés dans un plan, par type de lien. */
export const LINK_ENTITY: Record<LinkKind, string> = {
  documents: 'document_customer',
  audiences: 'audiences',
  previous_actions: 'dossier_actions',
};

const ROLE_SYNONYMS: Array<[RegExp, ActionLinkRole]> = [
  [/^(entree|input|source|utilise)/, ActionLinkRole.INPUT],
  [/^(sortie|output|produit|resultat|genere)/, ActionLinkRole.OUTPUT],
  [/^(preuve|justificatif|evidence|piece)/, ActionLinkRole.EVIDENCE],
  [/^(depend|prerequis|apres|dependson)/, ActionLinkRole.DEPENDS_ON],
];

export function toLinkRole(value: unknown, kind: LinkKind): ActionLinkRole {
  if (value !== undefined && value !== null && String(value).trim()) {
    const exact = matchEnumValue(value, Object.values(ActionLinkRole));
    if (exact) return exact as ActionLinkRole;
    const key = comparableKey(value);
    for (const [pattern, role] of ROLE_SYNONYMS) if (pattern.test(key)) return role;
  }
  return DEFAULT_LINK_ROLE[kind];
}

function toRawLink(item: unknown): RawLink | null {
  if (item === undefined || item === null) return null;
  if (typeof item === 'object' && !Array.isArray(item)) {
    const record = item as Record<string, unknown>;
    const ref =
      record.id ?? record.ref ?? record.name ?? record.title ?? record.label ?? record.date;
    if (ref === undefined || ref === null || String(ref).trim() === '') return null;
    return { ref: String(ref).trim(), role: record.role };
  }
  const ref = String(item).trim();
  return ref ? { ref } : null;
}

/**
 * Liste de liens demandée pour ce type, ou `undefined` si le plan n'en dit
 * rien. Une liste vide explicite (`[]`) signifie « aucun lien » et coupe les
 * liens automatiques. Accepte tableau, JSON, « a, b ; c » ou valeur seule.
 */
export function readLinkInput(
  fields: Record<string, any>,
  kind: LinkKind,
): RawLink[] | undefined {
  const key = LINK_ALIASES[kind].find((alias) => fields[alias] !== undefined);
  if (!key) return undefined;
  let value: unknown = fields[key];
  if (typeof value === 'string') {
    const text = value.trim();
    if (!text) return [];
    if (text.startsWith('[') || text.startsWith('{')) {
      try {
        value = JSON.parse(text);
      } catch {
        value = text;
      }
    }
    if (typeof value === 'string') value = value.split(/[,;\n]/);
  }
  const items = Array.isArray(value) ? value : [value];
  return items.map(toRawLink).filter((link): link is RawLink => link !== null);
}

/** Retire des champs toutes les clés de liens (elles ne sont pas des colonnes). */
export function withoutLinkFields(fields: Record<string, any>): Record<string, any> {
  const out = { ...fields };
  for (const kind of LINK_KINDS) for (const alias of LINK_ALIASES[kind]) delete out[alias];
  return out;
}

export interface RelationRequirement {
  min: number;
  roles: string[];
}

/** Même lecture des `required_relations` que validateRequiredRelations. */
export function requirementFor(
  requirements: Record<string, unknown> | null | undefined,
  kind: LinkKind,
): RelationRequirement | null {
  const raw = requirements?.[kind];
  if (raw === undefined || raw === false || raw === null) return null;
  const requirement =
    typeof raw === 'object'
      ? (raw as { min?: unknown; roles?: unknown })
      : { min: raw === true ? 1 : Number(raw) };
  const configured = Number(requirement.min ?? 1);
  const min = Number.isFinite(configured) ? Math.max(0, configured) : 1;
  const roles = Array.isArray(requirement.roles)
    ? requirement.roles.map(String)
    : [];
  return { min, roles };
}

export function dedupeLinks(links: ActionLink[]): ActionLink[] {
  const seen = new Set<string>();
  return links.filter((link) => {
    const key = `${String(link.id)}:${link.role}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
