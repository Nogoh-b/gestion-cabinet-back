// src/core/ai-database/skills/skill-helpers.ts
import type { ReferencedEntityContext } from '../dto/ask-question.dto';
import type { AiSkillContext, AiSkillTargetType } from './ai-skill.types';

/** Type de mention du chat → table. */
export const SKILL_TARGET_TABLES: Record<AiSkillTargetType, string> = {
  client: 'customer',
  dossier: 'dossiers',
  audience: 'audiences',
  facture: 'factures',
  employee: 'employee',
  diligence: 'diligences',
  document: 'document_customer',
};

/** Variantes envoyées par le chat (pages, anciennes mentions) → type canonique. */
const TYPE_ALIASES: Record<string, AiSkillTargetType> = {
  client: 'client',
  clients: 'client',
  customer: 'client',
  customers: 'client',
  dossier: 'dossier',
  dossiers: 'dossier',
  audience: 'audience',
  audiences: 'audience',
  facture: 'facture',
  factures: 'facture',
  invoice: 'facture',
  employee: 'employee',
  employees: 'employee',
  collaborateur: 'employee',
  diligence: 'diligence',
  diligences: 'diligence',
  document: 'document',
  documents: 'document',
  document_customer: 'document',
};

export interface SkillTarget {
  type: AiSkillTargetType;
  table: string;
  /** Entier, ou UUID pour les factures. */
  id: number | string;
  label: string;
}

export function canonicalTargetType(type: unknown): AiSkillTargetType | undefined {
  return TYPE_ALIASES[String(type ?? '').trim().toLowerCase()];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Identifiant d'un enregistrement : entier positif, ou UUID (factures). */
export function recordId(value: unknown): number | string | undefined {
  const text = String(value ?? '').trim();
  if (UUID.test(text)) return text;
  const id = Number(text);
  return text && Number.isInteger(id) && id > 0 ? id : undefined;
}

function referenceId(reference: ReferencedEntityContext): number | string | undefined {
  return recordId(reference.data?.id ?? reference.id);
}

/** Toutes les mentions d'un des `types`, dans l'ordre d'envoi (mentions puis page). */
export function findTargets(
  references: ReferencedEntityContext[],
  types: AiSkillTargetType[],
): SkillTarget[] {
  const seen = new Set<string>();
  const targets: SkillTarget[] = [];
  for (const reference of references) {
    const type = canonicalTargetType(reference.type);
    const id = referenceId(reference);
    if (!type || !id || !types.includes(type)) continue;
    const key = `${type}:${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    targets.push({ type, table: SKILL_TARGET_TABLES[type], id, label: reference.label || `#${id}` });
  }
  return targets;
}

/**
 * Cible d'une compétence : la première mention du type le plus prioritaire
 * de `types`. Une mention explicite (@) passe avant la page courante, car le
 * chat envoie les mentions après le contexte de page : on lit à rebours.
 */
export function findTarget(
  references: ReferencedEntityContext[],
  types: AiSkillTargetType[],
): SkillTarget | undefined {
  const all = findTargets([...references].reverse(), types);
  for (const type of types) {
    const match = all.find((target) => target.type === type);
    if (match) return match;
  }
  return undefined;
}

/** Cible reçue d'un bouton de suite (`params.target`), sinon les mentions. */
export function resolveSkillTarget(
  ctx: Pick<AiSkillContext, 'references' | 'params'>,
  types: AiSkillTargetType[],
): SkillTarget | undefined {
  const fromParams = ctx.params?.target;
  if (fromParams && typeof fromParams === 'object') {
    const type = canonicalTargetType(fromParams.type);
    const id = recordId(fromParams.id);
    if (type && types.includes(type) && id) {
      return { type, table: SKILL_TARGET_TABLES[type], id, label: String(fromParams.label ?? `#${id}`) };
    }
  }
  return findTarget(ctx.references, types);
}

/** Libellé lisible d'une liste de types (« un dossier ou un client »). */
export function describeTargetTypes(types: AiSkillTargetType[]): string {
  const labels: Record<AiSkillTargetType, string> = {
    client: 'un client',
    dossier: 'un dossier',
    audience: 'une audience',
    facture: 'une facture',
    employee: 'un collaborateur',
    diligence: 'une diligence',
    document: 'un document',
  };
  const items = types.map((type) => labels[type]);
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} ou ${items[items.length - 1]}`;
}

/**
 * JSON d'une réponse du modèle (balises ```json et texte autour tolérés),
 * comme le parseur du planificateur. `null` si illisible.
 */
export function parseLlmJson<T = Record<string, any>>(content: string): T | null {
  let clean = String(content ?? '').trim();
  clean = clean.replace(/```json\s*/gi, '').replace(/```\s*/g, '');
  const match = clean.match(/\{[\s\S]*\}/);
  if (match) clean = match[0];
  for (const candidate of [clean, escapeRawControlChars(clean)]) {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      // Essai suivant.
    }
  }
  return null;
}

/**
 * Retours à la ligne et tabulations bruts dans les chaînes d'un JSON (corps
 * d'e-mail, courrier) : les modèles les écrivent souvent tels quels, ce qui
 * rend le JSON invalide. Échappés ici ; le reste du JSON est inchangé.
 */
function escapeRawControlChars(json: string): string {
  let out = '';
  let inString = false;
  for (let i = 0; i < json.length; i++) {
    const char = json[i];
    if (!inString) {
      if (char === '"') inString = true;
      out += char;
    } else if (char === '\\') {
      out += char + (json[i + 1] ?? '');
      i++;
    } else if (char === '"') {
      inString = false;
      out += char;
    } else if (char === '\n') {
      out += '\\n';
    } else if (char === '\t') {
      out += '\\t';
    } else if (char >= ' ') {
      out += char;
    }
  }
  return out;
}

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Texte rédigé (paragraphes séparés par une ligne vide) → HTML simple. */
export function textToHtml(text: string): string {
  const value = String(text ?? '').trim();
  if (/<(p|div|br|ul|ol|table|strong|em)\b/i.test(value)) return value;
  return value
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('\n');
}

/** HTML → texte lisible (aperçu, message WhatsApp). */
export function htmlToText(html: string): string {
  return String(html ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Contexte commun des prompts de rédaction (demande, citation, pièces). */
export function draftingContext(ctx: Pick<AiSkillContext, 'question' | 'quote' | 'documents' | 'history' | 'userContext'>): string {
  const parts = [`Demande de l'utilisateur : ${ctx.question}`];
  if (ctx.quote) parts.push(`Passage cité :\n"""\n${ctx.quote.slice(0, 6000)}\n"""`);
  for (const doc of ctx.documents.slice(0, 3)) {
    parts.push(`Pièce jointe « ${doc.name} » :\n"""\n${doc.content.slice(0, 8000)}\n"""`);
  }
  const lastAnswer = [...ctx.history].reverse().find((message) => message.role === 'assistant');
  if (lastAnswer?.content) {
    parts.push(`Dernière réponse de l'assistant (si la demande s'y réfère) :\n"""\n${lastAnswer.content.slice(0, 4000)}\n"""`);
  }
  if (ctx.userContext) parts.push(ctx.userContext);
  return parts.join('\n\n');
}

/** Date du jour en toutes lettres (« 19 octobre 2026 »). */
export function todayFr(now = new Date()): string {
  return now.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}
