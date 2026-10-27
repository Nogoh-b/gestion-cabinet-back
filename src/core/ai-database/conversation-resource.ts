import type { ReferencedEntityContext } from './dto/ask-question.dto';

/** Ressource métier à laquelle une conversation est rattachée (affichée dans l'historique). */
export interface ConversationResource {
  type: string;
  id: string;
  label: string;
}

/** Types qui identifient une fiche ; les références de page ou de création sont ignorées. */
const BUSINESS_TYPES = new Set([
  'dossier', 'client', 'customer', 'document', 'audience', 'facture', 'employee',
  'diligence', 'supplier', 'referrer', 'expense', 'paiement', 'dossier_action',
]);

/** Première référence métier exploitable d'un message (ou null). */
export function pickConversationResource(
  references?: ReferencedEntityContext[] | null,
): ConversationResource | null {
  for (const reference of references ?? []) {
    const type = String(reference?.type ?? '').trim().toLowerCase();
    const id = reference?.id ?? reference?.data?.id;
    const label = String(reference?.label ?? '').trim();
    if (!BUSINESS_TYPES.has(type) || id === undefined || id === null || id === '' || id === 'new' || !label) continue;
    return {
      type: type === 'customer' ? 'client' : type,
      id: String(id).slice(0, 64),
      label: label.slice(0, 255),
    };
  }
  return null;
}

/** Titre saisi par l'utilisateur : espaces normalisés, 1 à 120 caractères. */
export function normalizeConversationTitle(raw: unknown): string | null {
  const title = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (!title) return null;
  return title.slice(0, 120);
}
