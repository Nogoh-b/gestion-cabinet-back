import { describe, expect, it } from '@jest/globals';
import { ActionLinkRole } from '../case-workflow.enums';
import {
  dedupeLinks,
  readLinkInput,
  requirementFor,
  toLinkRole,
} from './action-links';

describe('action-links', () => {
  describe('readLinkInput', () => {
    it('renvoie undefined quand le plan ne parle pas de ce lien', () => {
      expect(readLinkInput({ title: 'X' }, 'audiences')).toBeUndefined();
    });

    it('garde une liste vide explicite (= aucun lien)', () => {
      expect(readLinkInput({ previous_actions: [] }, 'previous_actions')).toEqual([]);
    });

    it('accepte tableau, objets avec rôle, JSON et texte séparé par des virgules', () => {
      expect(readLinkInput({ audiences: [7, '12/11/2026'] }, 'audiences')).toEqual([
        { ref: '7' },
        { ref: '12/11/2026' },
      ]);
      expect(
        readLinkInput({ documents: [{ name: 'Contrat.pdf', role: 'preuve' }] }, 'documents'),
      ).toEqual([{ ref: 'Contrat.pdf', role: 'preuve' }]);
      expect(readLinkInput({ document_ids: '[3, 4]' }, 'documents')).toEqual([
        { ref: '3' },
        { ref: '4' },
      ]);
      expect(readLinkInput({ depends_on: 'Mise en demeure ; Relance' }, 'previous_actions')).toEqual([
        { ref: 'Mise en demeure' },
        { ref: 'Relance' },
      ]);
    });
  });

  describe('toLinkRole', () => {
    it('prend le rôle du formulaire par défaut', () => {
      expect(toLinkRole(undefined, 'documents')).toBe(ActionLinkRole.INPUT);
      expect(toLinkRole('', 'previous_actions')).toBe(ActionLinkRole.DEPENDS_ON);
    });

    it('comprend les rôles en clair', () => {
      expect(toLinkRole('evidence', 'documents')).toBe(ActionLinkRole.EVIDENCE);
      expect(toLinkRole('Pièce justificative', 'documents')).toBe(ActionLinkRole.EVIDENCE);
      expect(toLinkRole('sortie', 'documents')).toBe(ActionLinkRole.OUTPUT);
    });
  });

  describe('requirementFor', () => {
    it('lit required_relations comme validateRequiredRelations', () => {
      expect(requirementFor({ audiences: { min: 1 } }, 'audiences')).toEqual({ min: 1, roles: [] });
      expect(requirementFor({ documents: true }, 'documents')).toEqual({ min: 1, roles: [] });
      expect(requirementFor({ documents: { roles: ['EVIDENCE'] } }, 'documents')).toEqual({
        min: 1,
        roles: ['EVIDENCE'],
      });
      expect(requirementFor({ audiences: { min: 1 } }, 'documents')).toBeNull();
      expect(requirementFor(null, 'audiences')).toBeNull();
    });
  });

  it('dédoublonne par ressource et rôle', () => {
    expect(
      dedupeLinks([
        { id: 7, role: ActionLinkRole.INPUT },
        { id: '7', role: ActionLinkRole.INPUT },
        { id: 7, role: ActionLinkRole.EVIDENCE },
      ]),
    ).toEqual([
      { id: 7, role: ActionLinkRole.INPUT },
      { id: 7, role: ActionLinkRole.EVIDENCE },
    ]);
  });
});
