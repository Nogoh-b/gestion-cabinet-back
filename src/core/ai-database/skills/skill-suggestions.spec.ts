import { describe, it, expect } from '@jest/globals';

import type { AiSkillCatalogItem } from './ai-skill.types';
import { suggestSkills } from './skill-suggestions';

// Libellés et mots-clés des compétences de modules/ai-skills.
const skill = (code: string, label: string, keywords: string[]): AiSkillCatalogItem => ({
  code,
  label,
  keywords,
  description: '',
  icon: 'zap',
  category: 'documents',
  categoryLabel: 'Documents',
  targets: [],
  targetRequired: false,
  placeholder: '',
  examples: [],
});

const catalog = [
  skill('programmer_audience', 'Programmer une audience', ['audience', 'programmer', 'planifier', 'agenda', 'tribunal', 'renvoi']),
  skill('envoyer_email', 'Envoyer un e-mail', ['mail', 'email', 'e-mail', 'courriel', 'envoyer', 'écrire', 'message']),
  skill('message_portail', "Message à l'espace client", ['portail', 'espace', 'client', 'message', 'publier']),
  skill('whatsapp', 'Préparer un WhatsApp', ['whatsapp', 'sms', 'texto', 'téléphone', 'message']),
  skill('envoyer_facture', 'Envoyer une facture', ['facture', 'envoyer', 'transmettre', 'honoraires']),
  skill('relancer_impayes', 'Relancer les impayés', ['relance', 'relancer', 'impayé', 'impayés', 'recouvrement', 'paiement']),
  skill('courrier', 'Courrier', ['courrier', 'lettre', 'document', 'rédiger', 'pdf']),
  skill('mise_en_demeure', 'Mise en demeure', ['mise', 'demeure', 'sommation', 'recouvrement', 'lettre', 'créance']),
  skill('traduire', 'Traduire (français ↔ anglais)', ['traduire', 'traduction', 'anglais', 'english', 'translate', 'français']),
  skill('rapport_activite', "Rapport d'activité", ['rapport', 'bilan', 'activité', 'statistiques', 'tableau', 'reporting']),
  skill('compte_rendu_audience', "Compte rendu d'audience", ['compte', 'rendu', 'audience', 'renvoi', 'décision', 'client']),
  skill('etat_impayes', 'État des impayés', ['impayés', 'impayé', 'créances', 'retard', 'factures', 'recouvrement', 'relance']),
  skill('document_modele', 'Document depuis un modèle', ['attestation', 'convocation', 'avis', 'fiche', 'synthèse', 'rapport', 'ordre', 'mission', 'modèle', 'pdf']),
];

const codes = (question: string) => suggestSkills(question, catalog).map((item) => item.code);

describe('compétences proposées sur la carte de choix du mode', () => {
  it('reconnaît une demande de courrier rédigé', () => {
    expect(codes('rédige un courrier de relance pour le client Mbarga')).toEqual(['courrier']);
  });

  it('un mot propre à une compétence suffit', () => {
    expect(codes('envoie un whatsapp à M. Kamga')).toEqual(['whatsapp']);
    expect(codes('traduis ce paragraphe')).toEqual(['traduire']);
    expect(codes('prépare une mise en demeure')).toEqual(['mise_en_demeure']);
  });

  it('ne propose rien pour un mot commun à plusieurs compétences', () => {
    expect(codes('les audiences de demain')).toEqual([]);
    expect(codes('le client Kamga a-t-il payé sa dernière facture ?')).toEqual([]);
    expect(codes('la TVA')).toEqual([]);
    expect(codes('rapport')).toEqual([]);
  });

  it('en propose deux au plus, la plus proche d’abord', () => {
    const found = suggestSkills('compte rendu de l’audience de renvoi au tribunal', catalog);
    expect(found.length).toBeLessThanOrEqual(2);
    expect(found[0].code).toBe('compte_rendu_audience');
  });
});
