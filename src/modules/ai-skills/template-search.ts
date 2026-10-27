// src/modules/ai-skills/template-search.ts
//
// Recherche des modèles par leur NOM (le code reste accepté) et texte lisible
// pour un utilisateur qui ne connaît ni les codes ni les variables.

import { normalizeSkillText } from 'src/core/ai-database/skills/skill-suggestions';

const norm = (text: unknown): string => normalizeSkillText(String(text ?? ''));

/** Mots de la demande qui ne désignent pas un modèle (verbes, famille, formules). */
const FILLER = new Set([
  'veux', 'voudrais', 'voudrait', 'aimerais', 'souhaite', 'souhaiterais', 'peux', 'pouvez', 'merci', 'stp', 'svp',
  'modifier', 'modifie', 'modifiez', 'changer', 'change', 'changez', 'personnaliser', 'personnalise',
  'corriger', 'corrige', 'mettre', 'mets', 'jour', 'actualiser', 'actualise', 'editer', 'edite',
  'lire', 'lis', 'lisez', 'montre', 'montrer', 'affiche', 'afficher', 'voir', 'vois', 'ouvre', 'ouvrir',
  'liste', 'lister', 'detail', 'details', 'contenu', 'quel', 'quelle', 'quels', 'quelles', 'tous', 'toutes', 'tout',
  'modele', 'modeles', 'template', 'templates', 'gabarit', 'gabarits', 'mail', 'mails', 'email', 'emails',
  'courriel', 'courriels', 'message', 'texte', 'pour', 'dans', 'avec', 'cette', 'celui', 'celle',
  'document', 'documents', 'bloc', 'blocs', 'entete', 'precision', 'apportee',
  'ajoute', 'ajouter', 'rends', 'rendre', 'plus', 'moins', 'long', 'longue', 'court', 'courte', 'consistante',
  'desactive', 'desactiver', 'reactive', 'reactiver', 'active', 'activer', 'renomme', 'renommer',
  // Chercher un modèle (« cherche le modèle facture client », « avons-nous un modèle de… »).
  'cherche', 'chercher', 'recherche', 'rechercher', 'trouve', 'trouver', 'retrouve', 'retrouver', 'consulte', 'consulter',
  'avons', 'avez', 'existe', 'nous', 'vous', 'deja',
]);

const stem = (word: string): string => word.replace(/(?:s|x)$/, '');

/** Mots qui désignent le modèle voulu (« Avis au client » → avis, client). */
export function designatingWords(text: string): string[] {
  const words = norm(text).split(/[^a-z0-9]+/).filter((word) => word.length > 3 && !FILLER.has(word));
  return [...new Set(words)];
}

/**
 * Partie de la demande qui désigne le modèle : « modifie le mail du dossier
 * client : mets l'objet à… » → ce qui précède les deux-points (le reste est la
 * consigne). Sans deux-points, toute la demande.
 */
export function designationPart(text: string): string {
  const [head] = String(text ?? '').split(/\s*:\s*/);
  return designatingWords(head).length ? head : String(text ?? '');
}

function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const kept = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = kept;
    }
  }
  return row[b.length];
}

/** 3 : même mot (pluriel près) ; 2 : début de mot ; 1,5 : faute de frappe ; 0 : rien. */
function wordHit(word: string, tokens: string[]): number {
  const wanted = stem(word);
  let best = 0;
  for (const raw of tokens) {
    const token = stem(raw);
    if (token === wanted) return 3;
    if (wanted.length >= 4 && token.length >= 4 && (token.startsWith(wanted) || wanted.startsWith(token))) best = Math.max(best, 2);
    else if (wanted.length >= 5 && token.length >= 5 && distance(wanted, token) <= 1) best = Math.max(best, 1.5);
  }
  return best;
}

const tokensOf = (text: unknown): string[] => norm(text).split(/[^a-z0-9]+/).filter(Boolean);

export interface SearchableTemplate {
  code?: string;
  name?: string;
  description?: string | null;
  /** Mots d'usage ajoutés à la recherche (« factures », « audiences », « clients »…). */
  usage?: string;
}

export interface TemplateMatch<T> {
  entry: T;
  score: number;
  /** Part des mots demandés retrouvés (1 : tous). */
  coverage: number;
}

/**
 * Modèles classés du plus proche au moins proche. Le nom pèse le plus, puis le
 * code, puis la description et l'usage. Les modèles sans aucun mot commun sont écartés.
 */
export function rankTemplates<T extends SearchableTemplate>(entries: T[], query: string): Array<TemplateMatch<T>> {
  const words = designatingWords(query);
  if (!words.length) return [];
  return entries
    .map((entry) => {
      const fields: Array<[string[], number]> = [
        [tokensOf(entry.name), 1],
        [tokensOf(entry.code), 0.7],
        [tokensOf(entry.description), 0.4],
        [tokensOf(entry.usage), 0.4],
      ];
      let score = 0;
      let found = 0;
      for (const word of words) {
        const best = Math.max(...fields.map(([tokens, weight]) => wordHit(word, tokens) * weight));
        if (best > 0) found++;
        score += best;
      }
      return { entry, score, coverage: found / words.length };
    })
    .filter((match) => match.score > 0)
    .sort((a, b) => b.coverage - a.coverage || b.score - a.score);
}

/** Modèle désigné sans équivoque : nom ou code identique, ou tous les mots trouvés par un seul modèle. */
export function confidentMatch<T extends SearchableTemplate>(entries: T[], query: string, code?: string | null): T | null {
  const wantedCode = norm(code);
  if (wantedCode) {
    const byCode = entries.find((entry) => norm(entry.code) === wantedCode);
    if (byCode) return byCode;
    // Nom cité entre guillemets (« Audience — Compte-rendu ») : il désigne le modèle à lui seul,
    // sans les mots de la consigne qui le suivent.
    const quoted = confidentMatch(entries, String(code));
    if (quoted) return quoted;
  }
  const asked = designatingWords(query).join(' ');
  if (asked) {
    const byName = entries.filter((entry) => designatingWords(String(entry.name ?? '')).join(' ') === asked);
    if (byName.length === 1) return byName[0];
  }
  const ranked = rankTemplates(entries, query);
  const [best, second] = ranked;
  if (best && best.coverage >= 1 && (!second || second.coverage < 1 || best.score >= second.score + 0.9)) return best.entry;
  const contained = containedName(entries, query);
  if (contained) return contained;
  // « pied de page PDF » / « … mail » : le canal cité (mot écarté de la recherche,
  // trop court ou trop courant) départage deux blocs du même nom.
  const channel = tokensOf(query).find((token) => token === 'pdf' || token === 'mail');
  if (channel) {
    const narrowed = entries.filter((entry) => tokensOf(entry.name).includes(channel));
    if (narrowed.length && narrowed.length < entries.length) return confidentMatch(narrowed, query);
  }
  return null;
}

/**
 * Nom complet d'un modèle repris dans la demande, suivi de la consigne sans
 * deux-points (« modifie audience compte rendu ajoute une phrase… ») : le plus
 * long nom retrouvé en entier l'emporte, jamais un nom d'un seul mot ni une égalité.
 */
function containedName<T extends SearchableTemplate>(entries: T[], query: string): T | null {
  const tokens = tokensOf(query);
  const contained = entries
    .map((entry) => ({ entry, words: designatingWords(String(entry.name ?? '')) }))
    .filter(({ words }) => words.length >= 2 && words.every((word) => wordHit(word, tokens) >= 2));
  const longest = Math.max(0, ...contained.map(({ words }) => words.length));
  const top = contained.filter(({ words }) => words.length === longest);
  return top.length === 1 ? top[0].entry : null;
}

// ── Modèle cité dans la conversation ────────────────────────────────────────

/**
 * « ce modèle », « le même modèle », « le modèle ci-dessus », « celui-ci » : la
 * demande renvoie à un modèle cité plus tôt dans la conversation.
 */
const BACK_REFERENCE =
  /\b(?:ce|cet|cette|le meme|la meme|meme|ledit|ladite)(?: \w+)? (?:modele|gabarit|template|trame)s?\b|\b(?:modele|gabarit|template|trame)s? (?:precedent|ci dessus|du dessus|affiche|cite|mentionne|evoque|choisi)\b|\bcelui (?:ci|la)\b/;

export function refersToEarlierTemplate(question: string): boolean {
  return BACK_REFERENCE.test(norm(question));
}

/**
 * Modèle cité en toutes lettres, par son nom ou son code (« ce modèle facture
 * client » → facture_client, « Modèle utilisé : Facture — Version client »).
 * Un nom compris dans un nom plus long cité aussi ne compte pas (« Facture
 * client » dans « Facture client détaillée »). `cited` dit si au moins un
 * modèle est cité, même sans vainqueur (plusieurs modèles : une liste).
 */
export function templateCitedIn<T extends { name?: string | null; code?: string | null }>(
  entries: T[],
  text: string,
): { entry?: T; cited: boolean } {
  const haystack = ` ${norm(text)} `;
  const hits = entries
    .map((entry) => {
      const phrase = [norm(entry.name), norm(String(entry.code ?? '').replace(/_/g, ' '))]
        .filter((candidate) => candidate.split(' ').length >= 2 && haystack.includes(` ${candidate} `))
        .sort((a, b) => b.length - a.length)[0];
      return { entry, phrase };
    })
    .filter((hit): hit is { entry: T; phrase: string } => !!hit.phrase);
  if (!hits.length) return { cited: false };
  const distinct = hits.filter((hit) => !hits.some((other) => other !== hit && other.phrase.length > hit.phrase.length && ` ${other.phrase} `.includes(` ${hit.phrase} `)));
  return distinct.length === 1 ? { entry: distinct[0].entry, cited: true } : { cited: true };
}

/**
 * Modèle désigné par « ce modèle » : le dernier cité dans la conversation (les
 * `max` derniers messages, du plus récent au plus ancien). Le message le plus
 * récent qui cite des modèles tranche : s'il en cite plusieurs à égalité (une
 * liste), aucun n'est choisi au hasard.
 */
export function templateCitedEarlier<T extends { name?: string | null; code?: string | null }>(
  entries: T[],
  history: Array<{ content: string }>,
  max = 6,
): T | undefined {
  for (const message of [...(history ?? [])].reverse().slice(0, max)) {
    const { entry, cited } = templateCitedIn(entries, message.content);
    if (cited) return entry;
  }
  return undefined;
}

// ── Texte lisible ───────────────────────────────────────────────────────────

const VARIABLE_LABELS: Record<string, string> = {
  cabinetname: 'nom du cabinet',
  cabinet: 'cabinet',
  year: 'année',
  generatedat_fmt: 'date de génération',
  audiencedate_fmt: 'date de l’audience',
  audience_time: 'heure de l’audience',
  decisiondate_fmt: 'date de la décision',
  decision_text: 'décision',
  decision_outcome: 'issue de la décision',
  report_content: 'compte rendu',
  status_label: 'statut',
  room: 'salle',
  judge_name: 'nom du juge',
  notes: 'notes',
  'jurisdiction.name': 'juridiction',
  'audiencetype.name': 'type d’audience',
  'dossier.dossier_number': 'numéro du dossier',
  'dossier.object': 'objet du dossier',
  'dossier.client_name': 'nom du client',
  firstname: 'prénom',
  lastname: 'nom',
  fullname: 'nom complet',
  full_name: 'nom complet',
  email: 'adresse e-mail',
  numero: 'numéro',
  dossiernumber: 'numéro du dossier',
};

/** « dossier.client_name » → « nom du client » ; sans traduction connue, le dernier mot en clair. */
export function humanVariable(name: string): string {
  const raw = String(name).trim();
  const key = raw.toLowerCase();
  if (VARIABLE_LABELS[key]) return VARIABLE_LABELS[key];
  const last = key.split('.').pop() ?? key;
  if (VARIABLE_LABELS[last]) return VARIABLE_LABELS[last];
  const word = (raw.split('.').pop() ?? raw).replace(/_fmt$/, '');
  return word.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim().toLowerCase() || 'valeur';
}

const ENTITIES: Record<string, string> = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': '’', '&apos;': '’' };

/**
 * Contenu d'un modèle lisible par tout le monde : sans balises ni accolades, les
 * champs automatiques apparaissent entre crochets (« [nom du client] »).
 */
export function readableText(html: unknown, max = 500): string {
  const text = String(html ?? '')
    .replace(/<(?:style|script)[\s\S]*?<\/(?:style|script)>/gi, ' ')
    .replace(/<\s*br\s*\/?>|<\/(?:p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\{\{[#/^!>][^}]*\}\}/g, ' ')
    .replace(/\{\{\{?\s*([\w.]+)\s*\}?\}\}/g, (_match, name: string) => `[${humanVariable(name)}]`)
    .replace(/&(?:nbsp|amp|lt|gt|quot|#39|apos);/g, (entity) => ENTITIES[entity] ?? entity)
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

const ENTITY_USAGE: Record<string, string> = {
  facture: 'les factures',
  dossier: 'les dossiers',
  client: 'les clients',
  customer: 'les clients',
  audience: 'les audiences',
  audience_list: 'les listes d’audiences',
  diligence: 'les diligences',
  general: 'un usage général',
  paiement: 'les paiements',
  payment: 'les paiements',
};

/** À quoi sert un modèle PDF, en clair (« les audiences »). */
export function pdfUsage(entityType: unknown): string {
  const key = String(entityType ?? '').toLowerCase();
  return ENTITY_USAGE[key] ?? key.replace(/_/g, ' ');
}

const MAIL_AUDIENCE: Record<string, string> = { client: 'aux clients', internal: 'à l’équipe du cabinet', staff: 'à l’équipe du cabinet', both: 'aux clients et à l’équipe' };
const MAIL_CATEGORY: Record<string, string> = {
  general: 'général',
  dossier: 'dossiers',
  facture: 'factures',
  invoice: 'factures',
  audience: 'audiences',
  account: 'compte utilisateur',
  auth: 'compte utilisateur',
};

export function mailUsage(category: unknown, audience: unknown): string {
  const to = MAIL_AUDIENCE[String(audience ?? '').toLowerCase()];
  const about = MAIL_CATEGORY[String(category ?? '').toLowerCase()];
  return [about && `sujet : ${about}`, to && `envoyé ${to}`].filter(Boolean).join(', ');
}

/**
 * Modifier un modèle lui-même (« modifie le modèle de contrat de bail »,
 * « ajoute une clause au modèle de bail ») : compétence « Modèles ». À ne pas
 * confondre avec produire un document « à partir du modèle » (rédaction) ni
 * avec « crée un modèle » (création). Motif sur le texte normalisé.
 */
export const TEMPLATE_EDIT_PATTERN =
  '/\\b(?:modifi|chang|corrig|personnalis|ameliore|renomm|desactiv|reactiv|actualis|ajout|retir|supprim|enleve|insere|remplac|mets a jour|mettre a jour|met a jour)\\w*\\b(?:(?!\\b(?:a partir|depuis|selon|d apres|en utilisant|utilise|sur la base|sous la base|en suivant|suivant|basant sur|avec)\\b).){0,50}\\b(?:au|du|le|la|l|ce|cet|cette|mon|ma|notre|dans le|dans mon|dans ce|dans notre) (?:modele|gabarit|template)s?\\b/';

const TEMPLATE_EDIT = new RegExp(TEMPLATE_EDIT_PATTERN.slice(1, -1));

/** La demande vise à modifier un modèle existant (pas à s'en servir ni à en créer un). */
export function editsTemplate(question: string): boolean {
  return TEMPLATE_EDIT.test(norm(question));
}
