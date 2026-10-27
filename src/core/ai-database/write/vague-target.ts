// write/vague-target.ts
//
// Une modification qui ne vise que la fiche ouverte « par défaut » (le contexte de
// page dit que la demande s'y rapporte), sans que l'utilisateur l'ait désignée ni
// dit quoi changer, est une devinette : on lui demande plutôt de choisir.

export interface VagueTargetOperation {
  operation: string;
  entity: string;
  entityId?: unknown;
  match?: unknown;
  fields?: Record<string, any>;
}

/** Fiche de la page ouverte ou cible déjà vue par l'utilisateur. */
type RecordKeys = Set<string>;

export const recordKeyOf = (entity: string, id: string | number): string =>
  `${String(entity).toLowerCase().replace(/s$/, '')}#${String(id).trim()}`;

const normalize = (text: string): string =>
  String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** « ce document », « celui-ci », « la fiche ouverte » : la demande vise bien la page. */
const PAGE_DEICTIC =
  /\b(ce|cet|cette|ces|celui|celle|ceux|ci|ici|actuel|actuelle|courant|courante|ouvert|ouverte|affiche|affichee|la fiche|cette page)\b/;

export function refersToOpenPage(question: string): boolean {
  return PAGE_DEICTIC.test(normalize(question));
}

/**
 * Opérations qui ne tiennent que par la fiche de la page : cible ni citée par
 * l'historique, ni mentionnée (@), ni tapée dans la demande, et demande sans
 * « ce / cette / celui-ci ». Une cible trouvée par `match` n'en fait pas partie
 * (le système exige alors une égalité exacte, sinon il fait choisir).
 */
export function pageOnlyTargets(
  operations: VagueTargetOperation[],
  question: string,
  pageKeys: RecordKeys,
  explicitKeys: RecordKeys,
): Array<{ index: number; entity: string; id: string }> {
  if (refersToOpenPage(question)) return [];
  const typed = new Set(question.match(/\d+/g) ?? []);
  const found: Array<{ index: number; entity: string; id: string }> = [];
  operations.forEach((op, index) => {
    if (!['UPDATE', 'DELETE'].includes(String(op.operation).toUpperCase())) return;
    const id = String(op.entityId ?? '').trim();
    if (!/^\d+$/.test(id)) return;
    const key = recordKeyOf(op.entity, id);
    if (typed.has(id) || explicitKeys.has(key) || !pageKeys.has(key)) return;
    found.push({ index, entity: op.entity, id });
  });
  return found;
}

/** Valeur de colonne comparable (dates et nombres lus de la base inclus). */
const comparable = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim().toLowerCase();
};

/**
 * La modification demandée change-t-elle quelque chose ? Faux quand aucun champ
 * n'est donné ou quand chacun reprend la valeur actuelle de la fiche (le
 * planificateur recopie alors le nom existant). Un champ inconnu de la table
 * compte comme un vrai changement : on ne bloque pas ce qu'on ne sait pas lire.
 */
export function changesAnything(
  fields: Record<string, any> | undefined,
  row: Record<string, any> | null,
  columns: Set<string>,
): boolean {
  const entries = Object.entries(fields ?? {}).filter(([, value]) => value !== undefined);
  if (!entries.length) return false;
  if (!row) return true;
  return entries.some(([name, value]) => !columns.has(name) || comparable(row[name]) !== comparable(value));
}

/** Mots de la demande (≥ 4 lettres) qui peuvent désigner un type d'élément. */
export function kindWords(question: string): string[] {
  return [...new Set(normalize(question).split(' '))].filter((word) => word.length >= 4);
}

const stem = (word: string): string => word.replace(/(?:s|x)$/, '');

/** Le libellé d'une table (« Modèles de mails ») contient-il ce mot ? */
export function labelHasWord(label: string, word: string): boolean {
  const wanted = stem(word);
  return normalize(label).split(' ').some((part) => stem(part) === wanted);
}
