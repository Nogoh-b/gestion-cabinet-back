/// <reference types="jest" />
import type { AiSkillCatalogItem } from './ai-skill.types';
import { mentionsTemplate, preferredTemplateSkill, withTemplateSkills } from './template-routing';

const skill = (code: string): AiSkillCatalogItem => ({
  code,
  label: code,
  description: '',
  icon: 'zap',
  category: 'documents',
  categoryLabel: '',
  targets: [],
  targetRequired: false,
  placeholder: '',
  examples: [],
  keywords: [],
});

const catalog = [skill('rediger_document'), skill('modeles'), skill('envoyer_email'), skill('whatsapp')];

describe('demandes sur un modèle (routage vers les compétences de modèle)', () => {
  it.each([
    'rediges un document sous la base de ce modèle facture client',
    'le template de facture',
    'quel gabarit pour la convocation ?',
    'utilise la même trame',
  ])('« %s » évoque un modèle', (question) => {
    expect(mentionsTemplate(question)).toBe(true);
  });

  it.each(['liste les factures du dossier CD-2026-003', 'quel est le modèle économique du cabinet ?'])(
    '« %s » n’évoque aucun modèle du cabinet',
    (question) => {
      expect(mentionsTemplate(question)).toBe(false);
    },
  );

  it('produire un document depuis le modèle, sinon gérer le modèle', () => {
    expect(preferredTemplateSkill('rediges un document sous la base de ce modèle facture client')).toBe('rediger_document');
    expect(preferredTemplateSkill('remplis ce modèle pour le dossier')).toBe('rediger_document');
    expect(preferredTemplateSkill('ce modèle facture client, il dit quoi ?')).toBe('modeles');
    // Un e-mail à partir d'un modèle n'est pas un document.
    expect(preferredTemplateSkill('rédige un mail à partir de ce modèle')).toBe('modeles');
  });

  it('ajoute les compétences de modèle en tête des candidates du classifieur', () => {
    const codes = (question: string, candidates: AiSkillCatalogItem[] = []) =>
      withTemplateSkills(question, candidates, catalog).map((item) => item.code);
    expect(codes('rediges un document sous la base de ce modèle facture client')).toEqual(['rediger_document', 'modeles']);
    expect(codes('ce modèle facture client est-il à jour ?', [skill('whatsapp')])).toEqual(['modeles', 'rediger_document', 'whatsapp']);
    // Sans modèle évoqué : candidates inchangées.
    expect(codes('liste les factures', [skill('whatsapp')])).toEqual(['whatsapp']);
    // Compétences absentes du catalogue (droits) : jamais proposées.
    expect(withTemplateSkills('ce modèle', [], [skill('whatsapp')])).toEqual([]);
  });
});
