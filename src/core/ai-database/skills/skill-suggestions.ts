// src/core/ai-database/skills/skill-suggestions.ts
import type { AiSkillCatalogItem } from './ai-skill.types';

/**
 * Compétences qui correspondent à une demande.
 *
 * - `detectSkillRequest` (mode auto) : une expression propre à la compétence
 *   (`autoTriggers` : « whatsapp », « mise en demeure ») et un verbe d'action
 *   (« prépare », « rédige », « calcule ») la désignent sans ambiguïté ; elle
 *   est alors lancée directement (elle finit toujours par une carte à valider).
 * - `suggestSkills` : compétences proposées sur la carte de choix du mode
 *   quand l'assistant hésite. Mots-clés seulement ; les verbes d'action
 *   (« préparer », « envoyer ») ne comptent pas, ils sont communs à toutes.
 */

const STOPWORDS = new Set([
  'les', 'des', 'une', 'aux', 'pour', 'avec', 'dans', 'sur', 'par', 'que', 'qui',
  'est', 'son', 'ses', 'sa', 'mon', 'mes', 'ton', 'tes', 'nos', 'vos', 'leur',
  'leurs', 'cette', 'ces', 'cet', 'tout', 'tous', 'depuis', 'modele', 'the',
]);

/**
 * Verbes d'action (impératif, infinitif, 2ᵉ personne) : ils signalent une
 * demande à réaliser, pas une consultation. Comparés au mot exact, pour que
 * « les mails envoyés hier » ne compte pas comme « envoie un mail ».
 */
const ACTION_VERBS = new Set([
  'prepare', 'preparer', 'prepares', 'preparez', 'redige', 'rediger', 'rediges', 'redigez',
  'ecris', 'ecrire', 'ecrivez', 'envoie', 'envoyer', 'envoies', 'envoyez', 'fais', 'faire',
  'faites', 'genere', 'generer', 'generez', 'calcule', 'calculer', 'calculez', 'etablis',
  'etablir', 'dresse', 'dresser', 'produis', 'produire', 'traduis', 'traduire', 'traduisez',
  'anonymise', 'anonymiser', 'pseudonymise', 'pseudonymiser', 'occulte', 'occulter', 'lis',
  'lire', 'lisez', 'relis', 'relire', 'analyse', 'analyser', 'analysez', 'evalue', 'evaluer',
  'estime', 'estimer', 'compare', 'comparer', 'controle', 'controler', 'verifie', 'verifier',
  'exporte', 'exporter', 'telecharge', 'telecharger', 'resume', 'resumer', 'extrais',
  'extraire', 'trouve', 'trouver', 'cherche', 'chercher', 'donne', 'donner', 'sors', 'sortir',
  'plaide', 'plaider', 'audite', 'auditer', 'reponds', 'repondre', 'compose', 'composer',
  'monte', 'monter', 'construis', 'construire', 'elabore', 'elaborer', 'propose', 'proposer',
  'transmets', 'transmettre', 'publie', 'publier', 'previens', 'prevenir', 'informe', 'informer',
  'demande', 'demander', 'demandez', 'rappelle', 'rappeler', 'rappelez', 'enregistre', 'enregistrer',
]);

/**
 * Verbes communs à toutes les compétences (« prépare », « envoie », « rédige ») :
 * ils ne disent pas laquelle est voulue. « traduis », « calcule », « anonymise »
 * restent, ils désignent leur compétence.
 */
const GENERIC_VERBS = new Set([
  'prepare', 'preparer', 'prepares', 'preparez', 'redige', 'rediger', 'rediges', 'redigez',
  'ecris', 'ecrire', 'ecrivez', 'envoie', 'envoyer', 'envoies', 'envoyez', 'fais', 'faire',
  'faites', 'genere', 'generer', 'generez', 'donne', 'donner', 'propose', 'proposer',
]);

const MODAL_CUES = [
  /\bje (veux|voudrais|souhaite|souhaiterais|dois)\b/,
  /\bj aimerais\b/,
  /\bil (me |nous )?faut\b/,
  /\b(peux|pourrais|pouvez|pourriez) (tu|vous)\b/,
  /\baide (moi|nous)\b/,
  /\bmerci de\b/,
  /\b(besoin|envie) d\b/,
  /\bon (doit|va)\b/,
];

/** Questions d'usage : l'Aide les explique (« comment préparer un WhatsApp ? »). */
const USAGE_QUESTION =
  /^(comment|c est quoi|qu est ce qu|qu est ce que|a quoi (sert|servent)|pourquoi|explique|ou (se trouve|trouver|est|sont))\b|\bcomment (on|faire|je|puis je|peut on|est ce qu)\b|\b(a quoi sert|c est quoi)\b/;

/** Consultations (« combien de… », « quels courriers… ») : la lecture y répond. */
const READ_QUESTION = /^(combien|quels?|quelles?|liste[rz]?|affiche[rz]?|y a t il|ou|quand|qui|est ce qu (il|elle|on) y a)\b/;

export function normalizeSkillText(text: string): string {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function words(text: string): string[] {
  return normalizeSkillText(text)
    .split(' ')
    .filter((word) => word.length >= 3 && !STOPWORDS.has(word));
}

/** Terminaisons de conjugaison et de pluriel (« traduis » / « traduire », « délai » / « délais »). */
const ENDINGS = new Set(['', 'e', 'r', 's', 'x', 'er', 'es', 'ez', 're', 'is', 'ir', 'it', 'ee', 'ees', 'ent', 'ons']);

/**
 * Même mot à la conjugaison ou au pluriel près : un même radical d'au moins
 * 4 lettres suivi de terminaisons (« redige » / « rediger », « relis » /
 * « relire »), mais pas « courrier » / « courriel » ni « préparer » /
 * « préparation ».
 */
function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  let common = 0;
  while (common < a.length && common < b.length && a[common] === b[common]) common++;
  return common >= 4 && ENDINGS.has(a.slice(common)) && ENDINGS.has(b.slice(common));
}

/**
 * Déclencheur « /motif/ » : expression régulière testée sur la demande
 * normalisée (minuscules, sans accents ni ponctuation). Il porte son verbe
 * (« crée un modèle », « à partir du modèle ») et l'emporte sur les mots seuls.
 */
const PATTERN_SCORE = 10;

function isPattern(expression: string): boolean {
  return expression.length > 2 && expression.startsWith('/') && expression.endsWith('/');
}

function matchesPattern(normalized: string, expression: string): boolean {
  try {
    return new RegExp(expression.slice(1, -1)).test(normalized);
  } catch {
    return false;
  }
}

/** Tous les mots porteurs de l'expression figurent dans la demande. */
function containsExpression(asked: string[], expression: string, normalized = ''): number {
  if (isPattern(expression)) return matchesPattern(normalized, expression) ? PATTERN_SCORE : 0;
  const needed = words(expression);
  if (!needed.length) return 0;
  return needed.every((word) => asked.some((item) => sameWord(item, word))) ? needed.length : 0;
}

/** La demande contient un verbe d'action (ou « je veux », « peux-tu »…). */
export function hasActionCue(question: string): boolean {
  const normalized = normalizeSkillText(question);
  if (normalized.split(' ').some((word) => ACTION_VERBS.has(word))) return true;
  return MODAL_CUES.some((pattern) => pattern.test(normalized));
}

export interface SkillDetection {
  /** Compétence retenue (la mieux désignée). */
  code?: string;
  /** Désignée sans ambiguïté et demandée avec un verbe d'action : lancement direct. */
  decisive: boolean;
  /** Compétences évoquées, la plus probable d'abord (pour le classifieur ou la carte de choix). */
  candidates: AiSkillCatalogItem[];
  /** Expression reconnue (« mise en demeure »). */
  trigger?: string;
  /** Question de consultation (« quel est… », « liste… ») : jamais lancée d'office. */
  consultation?: boolean;
}

/**
 * Compétence évoquée qui vise un enregistrement mentionné (« Décompte de
 * @facture… ») : elle passe avant la lecture des documents de la conversation,
 * qui ne contiennent ni factures ni paiements. Seulement la mieux désignée,
 * et jamais pour une question de consultation.
 */
export function skillForReferencedRecord(
  detection: SkillDetection,
  referencedTypes: string[],
): AiSkillCatalogItem | undefined {
  const [best] = detection.candidates;
  if (!best || detection.consultation || best.code !== detection.code) return undefined;
  return best.targets?.some((type) => referencedTypes.includes(type)) ? best : undefined;
}

/**
 * Compétence demandée en mode auto. Seules les compétences dotées de
 * déclencheurs (`autoTriggers`) peuvent être reconnues ; l'expression la plus
 * longue l'emporte (« lettre de mise en demeure » → Mise en demeure, pas
 * Courrier) ; à égalité, rien n'est décisif.
 */
export function detectSkillRequest(question: string, catalog: AiSkillCatalogItem[]): SkillDetection {
  const normalized = normalizeSkillText(question);
  const asked = [...new Set(words(question))];
  if (!asked.length || normalized.length > 600) return { decisive: false, candidates: [] };

  const scored = catalog
    .map((skill) => {
      if (!skill.autoTriggers?.length) return { skill, score: 0, trigger: '' };
      if ((skill.autoExclude ?? []).some((expression) => containsExpression(asked, expression, normalized))) {
        return { skill, score: 0, trigger: '' };
      }
      let score = 0;
      let trigger = '';
      for (const expression of skill.autoTriggers) {
        const matched = containsExpression(asked, expression, normalized);
        if (matched > score) {
          score = matched;
          // Un motif est cité par le passage reconnu (« cree un modele »), pas par son expression.
          trigger = isPattern(expression) ? new RegExp(expression.slice(1, -1)).exec(normalized)?.[0].trim() ?? '' : expression;
        }
      }
      return { skill, score, trigger };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  if (!scored.length) return { decisive: false, candidates: [] };
  const [best, second] = scored;
  const usage = USAGE_QUESTION.test(normalized);
  const consultation = READ_QUESTION.test(normalized) && !hasModalCue(normalized);
  // Une compétence « consultation auto-lançable » répond elle-même (liste, lecture)
  // quand la demande la désigne sans ambiguïté, au lieu de la lecture générique.
  const selfAnswered = best.skill.autoLaunchOnConsultation === true;
  const decisive = !usage && (!consultation || selfAnswered)
    && (best.score >= PATTERN_SCORE || hasActionCue(question))
    && (!second || best.score > second.score);
  return {
    code: best.skill.code,
    decisive,
    trigger: best.trigger,
    consultation,
    candidates: usage ? [] : scored.slice(0, 3).map((entry) => entry.skill),
  };
}

function hasModalCue(normalized: string): boolean {
  return MODAL_CUES.some((pattern) => pattern.test(normalized));
}

export function suggestSkills(
  question: string,
  catalog: AiSkillCatalogItem[],
  max = 2,
): AiSkillCatalogItem[] {
  // Les verbes génériques (« prépare » ≈ « préparation ») ne désignent aucune compétence.
  const asked = [...new Set(words(question))].filter((word) => !GENERIC_VERBS.has(word));
  if (!asked.length) return [];
  const vocabularies = catalog.map((skill) =>
    [...new Set(skill.keywords.flatMap(words))].filter((word) => !GENERIC_VERBS.has(word)),
  );
  const owners = (word: string) =>
    vocabularies.filter((vocabulary) => vocabulary.some((item) => sameWord(item, word))).length;

  return catalog
    .map((skill, index) => {
      let score = 0;
      for (const word of asked) {
        if (!vocabularies[index].some((item) => sameWord(item, word))) continue;
        score += owners(word) === 1 ? 2 : 1;
      }
      return { skill, score };
    })
    .filter((entry) => entry.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map((entry) => entry.skill);
}
