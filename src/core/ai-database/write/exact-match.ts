/**
 * Correspondance DÉTERMINISTE entre un texte cité par l'IA (nom, numéro,
 * code, e-mail…) et des enregistrements : aucune similarité ni probabilité.
 *
 * Un enregistrement n'est retenu automatiquement que si le texte le désigne
 * sans doute possible ; sinon les enregistrements proches sont seulement
 * PROPOSÉS et l'utilisateur choisit.
 *
 * Niveaux, du plus sûr au moins sûr :
 *  - exact   : le texte EST la valeur d'un champ identifiant (casse, accents,
 *              ponctuation et espaces ignorés), ou le nom complet dans un
 *              sens ou dans l'autre ;
 *  - words   : chaque mot du texte est un mot entier de l'enregistrement
 *              (« Dupont » → « Jean Dupont ») ;
 *  - prefix  : chaque mot du texte commence un mot de l'enregistrement
 *              (« PART » → « PARTICULIER ») — retenu seulement pour les
 *              référentiels, jamais pour un client ou un dossier ;
 *  - partial : au moins un mot en commun — simple suggestion.
 */

export type MatchTier = 'exact' | 'words' | 'prefix' | 'partial';

export const MATCH_TIER_LABELS: Record<MatchTier, string> = {
  exact: 'correspondance exacte',
  words: 'tous les mots',
  prefix: 'abréviation',
  partial: 'proche',
};

/** Rang conservé dans `score` pour l'ordre des listes (jamais affiché). */
export const MATCH_TIER_RANK: Record<MatchTier, number> = {
  exact: 100,
  words: 90,
  prefix: 75,
  partial: 50,
};

/** Minuscules, sans accents, ponctuation → espace, espaces réduits. */
export function normalizeIdentity(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9@.\s]/g, ' ')
    .replace(/[.](?=\s|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const compact = (value: string) => value.replace(/[\s.]/g, '');
const wordsOf = (value: string) => value.split(' ').filter(Boolean);

/** Civilités, titres et articles : ils ne désignent pas l'enregistrement (« Maître Dupont »). */
export const IGNORED_QUERY_WORDS = new Set([
  'm', 'mr', 'mme', 'mlle', 'me', 'maitre', 'monsieur', 'madame', 'mademoiselle',
  'dr', 'docteur', 'pr', 'professeur', 'avocat', 'avocate', 'client', 'cliente',
  'le', 'la', 'les', 'l', 'de', 'du', 'des', 'd',
]);

/** Mots utiles d'un texte cherché (sans civilités ni articles), le plus long d'abord. */
export function searchWords(term: string): string[] {
  const all = wordsOf(normalizeIdentity(term).replace(/[@.]/g, ' '));
  const useful = all.filter((w) => !IGNORED_QUERY_WORDS.has(w));
  return [...new Set(useful.length ? useful : all)].sort((a, b) => b.length - a.length);
}

/**
 * Niveau de correspondance du texte `term` avec un enregistrement décrit par
 * ses valeurs identifiantes (`texts` : un élément par champ, plus les
 * compositions utiles comme « prénom nom »). `null` = aucun mot en commun.
 */
export function matchTier(term: string, texts: unknown[]): MatchTier | null {
  const query = normalizeIdentity(term);
  if (!query) return null;
  const values = texts.map(normalizeIdentity).filter(Boolean);
  if (!values.length) return null;

  const queryCompact = compact(query);
  if (values.some((v) => v === query || compact(v) === queryCompact)) return 'exact';

  const allWords = wordsOf(query);
  const useful = allWords.filter((w) => !IGNORED_QUERY_WORDS.has(w));
  const queryWords = useful.length ? useful : allWords;
  const recordWords = new Set(values.flatMap(wordsOf));
  if (queryWords.every((w) => recordWords.has(w))) return 'words';

  const starts = (w: string) => [...recordWords].some((rw) => rw.startsWith(w));
  if (queryWords.every((w) => w.length >= 2 && starts(w))) return 'prefix';

  if (queryWords.some((w) => w.length >= 3 && (recordWords.has(w) || starts(w)))) return 'partial';
  return null;
}

export interface TieredMatch<T> {
  entity: T;
  tier: MatchTier;
}

export interface DeterministicPick<T> {
  /** Enregistrement retenu sans ambiguïté, sinon null. */
  best: T | null;
  bestTier: MatchTier | null;
  /** Plusieurs enregistrements au même niveau sûr : l'utilisateur choisit. */
  ambiguous: boolean;
  /** Candidats à proposer, les plus sûrs d'abord (ordre stable). */
  matches: TieredMatch<T>[];
}

/**
 * Choisit l'enregistrement désigné par `term` parmi `rows`.
 * `allowPrefix` : une abréviation unique suffit (référentiels : types, statuts…).
 */
export function pickDeterministic<T>(
  term: string,
  rows: T[],
  textsOf: (row: T) => unknown[],
  options: { allowPrefix?: boolean } = {},
): DeterministicPick<T> {
  const order: MatchTier[] = ['exact', 'words', 'prefix', 'partial'];
  const matches = rows
    .map((entity, index) => ({ entity, tier: matchTier(term, textsOf(entity)), index }))
    .filter((m): m is { entity: T; tier: MatchTier; index: number } => m.tier !== null)
    .sort((a, b) => order.indexOf(a.tier) - order.indexOf(b.tier) || a.index - b.index)
    .map(({ entity, tier }) => ({ entity, tier }));

  const decisive: MatchTier[] = options.allowPrefix ? ['exact', 'words', 'prefix'] : ['exact', 'words'];
  for (const tier of decisive) {
    const atTier = matches.filter((m) => m.tier === tier);
    if (atTier.length === 1) {
      return { best: atTier[0].entity, bestTier: tier, ambiguous: false, matches };
    }
    if (atTier.length > 1) {
      return { best: null, bestTier: null, ambiguous: true, matches: atTier };
    }
  }
  return { best: null, bestTier: null, ambiguous: false, matches };
}
