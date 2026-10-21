import { describe, expect, it } from '@jest/globals';
import { resolveOptionalSkillTarget, wantsWholeCabinet } from './skill-helpers';

/**
 * « Fais l'état des impayés du cabinet » sur une fiche dossier (21/10/2026) :
 * la réponse se limitait au dossier de la page.
 */
describe('portée « tout le cabinet » des compétences à cible facultative', () => {
  it.each([
    "Fais l'état des impayés du cabinet",
    'état des impayés de tout le cabinet',
    'rapport global des impayés',
    'impayés de tous les dossiers',
  ])('« %s » vise tout le cabinet', (question) => {
    expect(wantsWholeCabinet(question)).toBe(true);
  });

  it.each(["Fais l'état des impayés", 'impayés de ce dossier', 'état des impayés de Jean DUPONT'])(
    '« %s » garde la fiche',
    (question) => {
      expect(wantsWholeCabinet(question)).toBe(false);
    },
  );

  const page = { type: 'dossier', id: 38, label: 'DOS-2026-0038', source: 'page' as const };
  const mention = { type: 'client', id: 7, label: 'Jean DUPONT' };

  it('ignore la fiche de la page quand la demande vise le cabinet', () => {
    expect(resolveOptionalSkillTarget({ question: "Fais l'état des impayés du cabinet", references: [page], params: {} }, ['client', 'dossier'])).toBeUndefined();
  });

  it('garde la fiche de la page sinon', () => {
    expect(resolveOptionalSkillTarget({ question: "Fais l'état des impayés", references: [page], params: {} }, ['client', 'dossier'])?.id).toBe(38);
  });

  it('une mention @ explicite reste prise', () => {
    expect(resolveOptionalSkillTarget({ question: 'impayés du cabinet pour Jean DUPONT', references: [page, mention], params: {} }, ['client', 'dossier'])?.id).toBe(7);
  });
});
