/// <reference types="jest" />
// Détection des compétences en mode auto, sur les vraies définitions des
// compétences (déclencheurs `autoTriggers` et exclusions `autoExclude`).
import type { AiSkillCatalogItem, AiSkillHandler } from 'src/core/ai-database/skills/ai-skill.types';
import { detectSkillRequest, suggestSkills } from 'src/core/ai-database/skills/skill-suggestions';
import { planAnswer, splitRequests } from 'src/core/ai-database/answer-plan';
import * as agenda from './agenda.skills';
import * as analysis from './analysis.skills';
import * as communication from './communication.skills';
import * as documents from './document.skills';
import * as legal from './legal-tools.skills';
import * as reports from './report.skills';

/** Catalogue complet, comme `AiSkillService.catalog` pour un administrateur. */
function fullCatalog(): AiSkillCatalogItem[] {
  const handlers: AiSkillHandler[] = [];
  for (const exported of [agenda, analysis, communication, documents, legal, reports]) {
    for (const value of Object.values(exported)) {
      if (typeof value !== 'function' || !/Skill$/.test(value.name) || typeof value.prototype?.run !== 'function') continue;
      handlers.push(new (value as any)());
    }
  }
  return handlers.map(({ definition: d }) => ({
    code: d.code,
    label: d.label,
    description: d.description,
    icon: d.icon,
    category: d.category,
    categoryLabel: d.category,
    targets: d.targets ?? [],
    targetRequired: !!d.targetRequired,
    placeholder: d.placeholder,
    examples: d.examples ?? [],
    keywords: d.keywords ?? [],
    ...(d.autoTriggers && { autoTriggers: d.autoTriggers }),
    ...(d.autoExclude && { autoExclude: d.autoExclude }),
  }));
}

const catalog = fullCatalog();
const detect = (question: string) => detectSkillRequest(question, catalog);

describe('compétences reconnues en mode auto', () => {
  it('charge les 32 compétences', () => {
    expect(catalog).toHaveLength(32);
  });

  it.each([
    ['je veut preparer un whatsapp', 'whatsapp'],
    ['Préparer un WhatsApp pour Émilie Lefèvre', 'whatsapp'],
    ['envoie un SMS au client pour lui rappeler l’audience', 'whatsapp'],
    ['rédige un mail au client pour l’informer du renvoi', 'envoyer_email'],
    ['prépare une lettre de mise en demeure pour M. Kamga', 'mise_en_demeure'],
    ['rédige un courrier au greffe', 'courrier'],
    ['traduis ce paragraphe en anglais', 'traduire'],
    ['fais la version bilingue du bail', 'version_bilingue'],
    ['analyse ce jugement et sors les délais', 'lecture_jugement'],
    ['calcule le délai d’appel à partir du 12/10/2026', 'delais_procedure'],
    ['peux-tu calculer les intérêts moratoires sur 2 500 000 FCFA', 'decompte_creance'],
    ['rédige la requête en injonction de payer', 'injonction_payer'],
    ['prépare la convention d’honoraires du dossier', 'convention_honoraires'],
    ['anonymise ce document', 'anonymiser'],
    ['prépare la plaidoirie du dossier', 'dossier_plaidoirie'],
    ['fais le compte rendu de l’audience d’hier', 'compte_rendu_audience'],
    ['génère le rapport d’activité du mois', 'rapport_activite'],
    ['exporte le dossier en zip', 'export_dossier'],
    ['trouve les dossiers similaires', 'dossiers_comparables'],
    ['relis ce contrat et repère les clauses risquées', 'audit_contrat'],
  ])('« %s » → %s', (question, code) => {
    const result = detect(question);
    expect(result.code).toBe(code);
    expect(result.decisive).toBe(true);
  });

  it.each([
    // Questions d'usage : l'Aide les explique.
    'comment préparer un whatsapp ?',
    "c'est quoi une mise en demeure",
    // Consultations : la lecture y répond.
    'quels courriers ont été envoyés hier ?',
    'combien de mails envoyés ce mois',
    "quel est le délai d'appel au Cameroun ?",
    // Pas de verbe d'action : le classifieur tranche.
    'mise en demeure pour M. Kamga',
    // Envoi de facture : parcours d'écriture existant.
    'envoie la facture FAC-2026-0012 par mail',
    // Écritures guidées : jamais devinées.
    'programme une audience pour le dossier DOS-2026-0038 le 12 novembre',
    'crée une diligence pour relancer le greffe',
    // Rédiger un contrat n'est pas l'auditer.
    'rédige un contrat de bail commercial',
    // Questions sur le compte.
    'quel est mon role dans le cabinet',
    "quels est mon plan d'abonement actuel",
  ])('« %s » : rien de décisif', (question) => {
    expect(detect(question).decisive).toBe(false);
  });

  it('égalité entre deux compétences : rien de décisif, les deux sont candidates', () => {
    const result = detect('envoie la convocation au client par mail');
    expect(result.decisive).toBe(false);
    expect(result.candidates.map((item) => item.code)).toEqual(expect.arrayContaining(['envoyer_email', 'document_modele']));
  });

  it('sans verbe, la compétence reste candidate pour le classifieur', () => {
    const result = detect('mise en demeure pour M. Kamga');
    expect(result.candidates[0]?.code).toBe('mise_en_demeure');
  });

  it('une compétence absente du catalogue (droits, plan) ne peut pas être reconnue', () => {
    const withoutWhatsapp = catalog.filter((item) => item.code !== 'whatsapp');
    expect(detectSkillRequest('je veux préparer un whatsapp', withoutWhatsapp).decisive).toBe(false);
  });

  it('« préparer » ne propose plus le dossier de plaidoirie sur la carte de choix', () => {
    const codes = suggestSkills('je veux preparer un whatsapp', catalog).map((item) => item.code);
    expect(codes).toContain('whatsapp');
    expect(codes).not.toContain('dossier_plaidoirie');
  });
});

describe('réponses en plusieurs parties', () => {
  it('découpe sur « et » + verbe, « puis », « ensuite »', () => {
    expect(splitRequests('quel est mon rôle et liste mes dossiers en cours')).toEqual(['quel est mon rôle', 'liste mes dossiers en cours']);
    expect(splitRequests('résume le dossier DOS-2026-0038 puis prépare un whatsapp au client')).toEqual([
      'résume le dossier DOS-2026-0038',
      'prépare un whatsapp au client',
    ]);
    expect(splitRequests('explique comment créer une audience, ensuite montre mes audiences de demain')).toHaveLength(2);
  });

  it('ne coupe pas un « et » entre deux noms, ni « puis-je »', () => {
    expect(splitRequests('liste les factures et les paiements du mois')).toHaveLength(1);
    expect(splitRequests('comment puis-je créer une audience')).toHaveLength(1);
  });

  it('plan : chaque partie dans son mode, écriture en dernier', () => {
    const kinds: Record<string, any> = {
      'quel est mon rôle': { kind: 'PROFILE' },
      'liste mes dossiers en cours': { kind: 'READ' },
      'crée une diligence pour demain': { kind: 'WRITE' },
    };
    const steps = planAnswer('crée une diligence pour demain et quel est mon rôle et liste mes dossiers en cours', (segment) => kinds[segment] ?? null);
    expect(steps).toBeNull(); // « et quel » ne coupe pas : la partie inconnue bloque le plan.
    const ordered = planAnswer('crée une diligence pour demain puis liste mes dossiers en cours', (segment) => kinds[segment] ?? null);
    expect(ordered?.map((step) => step.kind)).toEqual(['READ', 'WRITE']);
  });

  it('deux lectures consécutives restent une seule lecture', () => {
    const steps = planAnswer('liste mes dossiers puis montre mes audiences', () => ({ kind: 'READ' }));
    expect(steps).toBeNull();
  });
});
