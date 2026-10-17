/**
 * Réponse « rien trouvé » du chat IA.
 *
 * Au lieu d'un conseil générique (« élargissez la recherche… »), la réponse
 * nomme ce que l'utilisateur a cherché, propose les enregistrements aux
 * numéros proches (ex: CD-2026-002 → DOS-2026-0002) et, à défaut, montre la
 * forme des numéros du cabinet. Fonctions pures : la lecture des candidats en
 * base est faite par AiDatabaseService.
 */

export interface NoResultsTarget {
  key: string;
  /** Table interrogée pour proposer des enregistrements proches. */
  table?: string;
  /** « dossier », « facture »… */
  noun: string;
  feminine: boolean;
  /** Ce que l'utilisateur peut préciser quand rien n'est identifiable. */
  hint: string;
}

export interface NearbyRecord {
  /** Identifiant métier affiché (numéro de dossier, de facture…). */
  code: string;
  /** Complément lisible (objet, client…). */
  label?: string;
  /** Autres identifiants comparés à la recherche (ex: numéro RG). */
  aliases?: Array<{ value: string; label: string }>;
}

export interface RankedRecord extends NearbyRecord {
  score: number;
  /** Identifiant secondaire qui correspond exactement (ex: numéro RG). */
  matchedAlias?: { value: string; label: string };
}

export interface NoResultsSuggestion {
  label: string;
  prompt: string;
}

const TARGETS: Array<{ test: RegExp; target: NoResultsTarget }> = [
  {
    test: /\b[eé]tapes?\b|\bstep|\bparcours\b/i,
    target: {
      key: 'step',
      noun: 'étape',
      feminine: true,
      hint: "Le dossier n'a peut-être pas encore de parcours actif : vérifiez le dossier concerné.",
    },
  },
  {
    // Avant « dossier » : « apporteurs d'affaires » contient « affaire ».
    test: /\bapp?orteurs?\b/i,
    target: {
      key: 'referrer',
      noun: "apporteur d'affaires",
      feminine: false,
      hint: "Vérifiez l'orthographe du nom de l'apporteur.",
    },
  },
  {
    test: /dossiers?|affaires?|litiges?/i,
    target: {
      key: 'dossier',
      table: 'dossiers',
      noun: 'dossier',
      feminine: false,
      hint: "Précisez le numéro du dossier, le nom du client ou l'objet de l'affaire.",
    },
  },
  {
    test: /clients?|customer|parties?/i,
    target: {
      key: 'client',
      table: 'customer',
      noun: 'client',
      feminine: false,
      hint: "Vérifiez l'orthographe du nom, ou donnez son email ou son téléphone.",
    },
  },
  {
    test: /factures?|honoraires?/i,
    target: {
      key: 'invoice',
      table: 'factures',
      noun: 'facture',
      feminine: true,
      hint: 'Précisez le numéro de la facture, le client ou le dossier concerné.',
    },
  },
  {
    test: /audiences?/i,
    target: {
      key: 'audience',
      noun: 'audience',
      feminine: true,
      hint: 'Précisez le dossier concerné ou la date de l’audience.',
    },
  },
  {
    test: /paiements?|r[eè]glements?|encaissements?/i,
    target: {
      key: 'payment',
      noun: 'paiement',
      feminine: false,
      hint: 'Précisez la facture ou le client concerné.',
    },
  },
  {
    test: /diligences?|t[aâ]ches?|[eé]ch[eé]ances?/i,
    target: {
      key: 'diligence',
      noun: 'diligence',
      feminine: true,
      hint: 'Précisez le dossier concerné.',
    },
  },
  {
    test: /documents?|pi[eè]ces?|fichiers?|contrats?/i,
    target: {
      key: 'document',
      noun: 'document',
      feminine: false,
      hint: 'Précisez le nom du document ou le dossier auquel il est rattaché.',
    },
  },
  {
    test: /avocats?|collaborateurs?|employ[eé]s?/i,
    target: {
      key: 'employee',
      noun: 'collaborateur',
      feminine: false,
      hint: "Vérifiez l'orthographe du nom.",
    },
  },
  {
    test: /comptab|[eé]critures?|journal|comptes?\b/i,
    target: {
      key: 'accounting',
      noun: 'écriture comptable',
      feminine: true,
      hint: 'Précisez le journal, le compte ou la période.',
    },
  },
];

const TABLE_TARGETS: Record<string, string> = {
  dossiers: 'dossier',
  customer: 'client',
  factures: 'invoice',
  audiences: 'audience',
  paiements: 'payment',
  diligences: 'diligence',
  document_customer: 'document',
  employee: 'employee',
};

/**
 * Objet principal de la demande : d'abord le mot qui précède l'identifiant
 * cherché (« dossier CD-2026-002 », « facture FAC-12 »), puis la question,
 * puis les tables interrogées.
 */
export function detectNoResultsTarget(
  question: string,
  tables: string[] = [],
  reference?: string,
): NoResultsTarget | null {
  const at = reference ? question.indexOf(reference) : -1;
  if (at > 0) {
    const before = question.slice(Math.max(0, at - 40), at);
    const near = TARGETS.find(({ test }) =>
      test.test(before.split(/\s+/).slice(-4).join(' ')),
    );
    if (near) return near.target;
  }
  const byQuestion = TARGETS.find(({ test }) => test.test(question));
  if (byQuestion) return byQuestion.target;
  const key = tables.map((t) => TABLE_TARGETS[t]).find(Boolean);
  return TARGETS.find(({ target }) => target.key === key)?.target ?? null;
}

/**
 * Identifiants cités dans la question : codes du type « CD-2026-002 »,
 * « DOS-2026-0018-649D », « FAC/2026/12 », et textes entre guillemets.
 */
export function extractSearchedReferences(question: string): string[] {
  const found: string[] = [];
  const add = (value: string) => {
    const v = value.trim();
    if (v && !found.some((f) => f.toLowerCase() === v.toLowerCase()))
      found.push(v);
  };
  for (const m of question.matchAll(/[«"“]\s*([^»"”]{2,80}?)\s*[»"”]/g))
    add(m[1]);
  for (const m of question.matchAll(
    /(?<![\w-])([A-Za-z]{1,8}(?:[-_/][A-Za-z0-9]{1,10}){1,4})(?![\w-])/g,
  )) {
    if (/\d/.test(m[1])) add(m[1]);
  }
  return found;
}

const normalizeCode = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

const numbersOf = (value: string): number[] =>
  (value.match(/\d+/g) ?? []).map(Number);

function levenshtein(a: string, b: string): number {
  const previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = previous[j];
      previous[j] =
        a[i - 1] === b[j - 1]
          ? diagonal
          : 1 + Math.min(diagonal, previous[j], previous[j - 1]);
      diagonal = above;
    }
  }
  return previous[b.length];
}

/** Proximité 0–1 entre la valeur cherchée et un identifiant. */
export function codeSimilarity(reference: string, candidate: string): number {
  const a = normalizeCode(reference);
  const b = normalizeCode(candidate);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const textual = 1 - levenshtein(a, b) / Math.max(a.length, b.length);
  // Mêmes nombres (2026 et 2 ↔ 2026 et 0002) : préfixe ou zéros différents.
  const wanted = numbersOf(reference);
  const available = numbersOf(candidate);
  const sameNumbers =
    wanted.length > 0 && wanted.every((n) => available.includes(n));
  return sameNumbers ? 0.8 + 0.2 * textual : textual;
}

/** Les enregistrements les plus proches de la valeur cherchée. */
export function rankNearbyRecords(
  reference: string,
  records: NearbyRecord[],
  limit = 3,
  minScore = 0.65,
): RankedRecord[] {
  return records
    .map((record) => {
      const exactAlias = record.aliases?.find(
        (alias) =>
          alias.value &&
          normalizeCode(alias.value) === normalizeCode(reference),
      );
      const score = exactAlias
        ? 1
        : Math.max(
            codeSimilarity(reference, record.code),
            ...(record.aliases ?? []).map((alias) =>
              codeSimilarity(reference, alias.value ?? ''),
            ),
          );
      return { ...record, score, matchedAlias: exactAlias };
    })
    .filter((record) => record.score >= minScore)
    .sort((x, y) => y.score - x.score)
    .slice(0, limit);
}

const none = (target: NoResultsTarget) =>
  target.feminine ? 'aucune' : 'aucun';

/** Message affiché, en Markdown. */
export function buildNoResultsMessage(input: {
  target: NoResultsTarget | null;
  references: string[];
  nearby: RankedRecord[];
  /** Identifiant le plus récent, pour montrer la forme des numéros. */
  example?: string;
  /** Le cabinet n'a encore aucun enregistrement de ce type. */
  empty?: boolean;
}): string {
  const { target, references, nearby, example, empty } = input;
  if (!target) {
    return references.length
      ? `Je n'ai rien trouvé pour **${references.join('**, **')}** dans le cabinet. Vérifiez l'orthographe ou reformulez avec un nom, un numéro ou une date.`
      : "Je n'ai rien trouvé dans le cabinet pour cette demande. Reformulez avec un nom, un numéro ou une date plus précis.";
  }
  const searched = references.length
    ? `${none(target)} ${target.noun} **${references.join('**, **')}**`
    : `${none(target)} ${target.noun} correspondant à votre demande`;
  const intro = `Je n'ai trouvé ${searched} dans le cabinet`;

  if (empty)
    return `Je n'ai trouvé ${searched} : le cabinet n'a encore ${none(target)} ${target.noun} enregistré${target.feminine ? 'e' : ''}.`;

  if (nearby.length) {
    const lines = nearby.map((record) => {
      const alias = record.matchedAlias
        ? ` (${record.matchedAlias.label} : ${record.matchedAlias.value})`
        : '';
      const label = record.label ? ` — ${record.label}` : '';
      return `- **${record.code}**${alias}${label}`;
    });
    const plural = nearby.length > 1;
    return `${intro}.\n\n${
      plural
        ? 'Enregistrements les plus proches'
        : 'Enregistrement le plus proche'
    } :\n${lines.join('\n')}\n\nIndiquez le bon ${target.noun} et je reprends votre demande.`;
  }

  if (references.length && example) {
    return `${intro}, ni de numéro approchant. Les numéros du cabinet ont la forme **${example}**. ${target.hint}`;
  }
  return `${intro}. ${target.hint}`;
}

/** Relances cliquables : la question d'origine avec le bon identifiant. */
export function buildNoResultsSuggestions(
  question: string,
  reference: string | undefined,
  nearby: RankedRecord[],
): NoResultsSuggestion[] {
  if (!reference) return [];
  return nearby.map((record) => ({
    label: record.code,
    prompt: question.split(reference).join(record.code),
  }));
}
