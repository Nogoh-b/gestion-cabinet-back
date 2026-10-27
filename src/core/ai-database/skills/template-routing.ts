// src/core/ai-database/skills/template-routing.ts
import type { AiSkillCatalogItem } from './ai-skill.types';
import { normalizeSkillText } from './skill-suggestions';

/**
 * Demandes qui portent sur un MODÈLE (modèle de document, de facture, de mail,
 * bloc, gabarit, template) : elles relèvent des compétences « Créer / modifier
 * un document » (produire un document depuis le modèle) et « Modèles »
 * (chercher, lire, modifier le modèle lui-même), jamais d'une lecture brute de
 * la base (« rédige un document sous la base de ce modèle facture client »
 * répondait avec les lignes des factures).
 *
 * Les déclencheurs des compétences reconnaissent les formes nettes ; quand
 * aucune n'est décisive, ces deux compétences sont au moins proposées au
 * classifieur, la plus probable d'abord.
 */

export const TEMPLATE_SKILLS = { produce: 'rediger_document', manage: 'modeles' } as const;

const TEMPLATE_WORD = /\b(?:modeles?|templates?|gabarits?|trames?)\b/;

/** « modèle économique », « modèle de gestion » : pas un modèle du cabinet. */
const NOT_A_TEMPLATE = /\bmodeles? (?:economique|d affaires|de gestion|de voiture|de vehicule|mathematique|statistique)s?\b/;

/** Verbes de production : le document est à produire depuis le modèle. */
const PRODUCE = /\b(?:redig|genere|prepar|produi|etabli|ecri|rempli|sors|sortir|fais|faire|faites)\w*/;

/** La demande porte sur un modèle du cabinet. */
export function mentionsTemplate(question: string): boolean {
  const text = normalizeSkillText(question);
  return TEMPLATE_WORD.test(text) && !NOT_A_TEMPLATE.test(text);
}

/** Compétence de modèle la plus probable : produire un document, sinon gérer le modèle. */
export function preferredTemplateSkill(question: string): string {
  const text = normalizeSkillText(question);
  // « Rédige un mail à partir du modèle » reste un e-mail (déclencheurs de l'e-mail).
  return PRODUCE.test(text) && !/\b(?:mails?|e mails?|emails?|courriels?)\b/.test(text)
    ? TEMPLATE_SKILLS.produce
    : TEMPLATE_SKILLS.manage;
}

/**
 * Candidates du classifieur, complétées par les compétences de modèle quand la
 * demande en évoque un (au plus 3, la plus probable d'abord).
 */
export function withTemplateSkills(
  question: string,
  candidates: AiSkillCatalogItem[],
  catalog: AiSkillCatalogItem[],
): AiSkillCatalogItem[] {
  if (!mentionsTemplate(question)) return candidates;
  const first = preferredTemplateSkill(question);
  const order = [first, first === TEMPLATE_SKILLS.produce ? TEMPLATE_SKILLS.manage : TEMPLATE_SKILLS.produce];
  const templates = order
    .map((code) => catalog.find((item) => item.code === code))
    .filter((item): item is AiSkillCatalogItem => !!item);
  return [...templates, ...candidates]
    .filter((item, index, all) => all.findIndex((other) => other.code === item.code) === index)
    .slice(0, 3);
}
