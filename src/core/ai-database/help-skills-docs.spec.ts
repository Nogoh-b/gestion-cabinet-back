/// <reference types="jest" />
/**
 * Mode Aide : chaque question sur une compétence ou un mode du chat doit
 * retrouver le guide qui la détaille (help-docs/competences*.md, modes-chat.md).
 */
import { loadHelpDocs, matchHelpDocs } from './help-knowledge';

const top = (question: string) => matchHelpDocs(question)[0]?.doc.id;
/** Guides joints à la réponse du mode Aide (les deux plus pertinents). */
const sent = (question: string) => matchHelpDocs(question).map((match) => match.doc.id);

describe('Guides des compétences et des modes du chat', () => {
  it('sont chargés avec leurs mots-clés', () => {
    const ids = loadHelpDocs().map((doc) => doc.id);
    expect(ids).toEqual(expect.arrayContaining([
      'competences',
      'competences-communication',
      'competences-documents',
      'competences-analyse',
      'competences-actes',
      'competences-rapports-agenda',
      'competences-facturation',
      'modes-chat',
    ]));
  });

  it.each([
    ['Comment utiliser les compétences du chat ?', 'competences'],
    ['À quoi sert le bouton éclair ?', 'competences'],
    ['Comment préparer un WhatsApp au client ?', 'competences-communication'],
    ['Comment programmer un e-mail depuis le chat ?', 'competences-communication'],
    ['Comment anonymiser un document ?', 'competences-documents'],
    ['Comment faire une version bilingue d’un contrat ?', 'competences-documents'],
    ['Comment lire un jugement avec le chat ?', 'competences-analyse'],
    ['Comment répondre aux conclusions adverses ?', 'competences-analyse'],
    ['Comment marche la chronologie du dossier ?', 'competences-analyse'],
    ['Comment évaluer les chances de succès d’un dossier ?', 'competences-analyse'],
    ['Comment calculer un délai d’opposition ?', 'competences-actes'],
    ['Comment faire un décompte de créance ?', 'competences-actes'],
    ['Comment rédiger une requête en injonction de payer ?', 'competences-actes'],
    ['Comment rédiger une convention d’honoraires ?', 'competences-actes'],
    ['Quelle est la différence entre mode et compétence ?', 'modes-chat'],
    ['Comment revenir au mode automatique ?', 'modes-chat'],
    ['À quoi sert le mode base de connaissance ?', 'modes-chat'],
    ['Comment poser plusieurs demandes dans une question ?', 'modes-chat'],
    ['Pourquoi la réponse est en plusieurs parties ?', 'modes-chat'],
    ['Pourquoi la compétence a été lancée automatiquement ?', 'modes-chat'],
    ['Que veut dire compétence en attente de précision ?', 'competences'],
    ['Comment faire un récapitulatif des actions menées sur le dossier ?', 'competences'],
    // 21/10/2026 : facturation, actions recommandées, cartes.
    ['Comment faire un devis avec le chat ?', 'competences-facturation'],
    ['Comment configurer la facturation avec l’IA ?', 'competences-facturation'],
    ['À quoi servent les actions recommandées ?', 'competences'],
    ['Comment réduire la carte du courrier ?', 'competences'],
    ['Comment corriger la réponse d’une compétence ?', 'competences'],
  ])('« %s » → %s', (question, expected) => {
    expect(top(question)).toBe(expected);
  });

  it('joint le guide de l’écran et celui de la compétence quand les deux répondent', () => {
    expect(sent('Comment reporter une audience depuis le chat ?')).toEqual(expect.arrayContaining(['audiences', 'competences-rapports-agenda']));
  });

  it('laisse la configuration de la convention du dossier au guide de facturation', () => {
    expect(top('comment configurer la convention d’honoraires d’un dossier')).toBe('facturation-configuration');
  });
});
