/// <reference types="jest" />
import { normalizeConversationTitle, pickConversationResource } from './conversation-resource';

describe('conversation-resource', () => {
  it('retient la première fiche métier citée', () => {
    expect(pickConversationResource([
      { type: 'page', label: 'Dossiers', id: 'x' },
      { type: 'dossier', label: 'DOS-2026-0001 · Litige', id: 91 },
      { type: 'client', label: 'Awa Ndiaye', id: 7 },
    ])).toEqual({ type: 'dossier', id: '91', label: 'DOS-2026-0001 · Litige' });
  });

  it('normalise les clients et lit l’identifiant dans data', () => {
    expect(pickConversationResource([{ type: 'customer', label: 'Awa', data: { id: 7 } }]))
      .toEqual({ type: 'client', id: '7', label: 'Awa' });
  });

  it('ignore les créations et les références sans identifiant', () => {
    expect(pickConversationResource([{ type: 'dossier', label: 'Création', data: { id: 'new' } }])).toBeNull();
    expect(pickConversationResource([{ type: 'dossier', label: 'Sans id' }])).toBeNull();
    expect(pickConversationResource(undefined)).toBeNull();
  });

  it('valide le titre saisi', () => {
    expect(normalizeConversationTitle('  Synthèse   du dossier  ')).toBe('Synthèse du dossier');
    expect(normalizeConversationTitle('   ')).toBeNull();
    expect(normalizeConversationTitle('x'.repeat(200))).toHaveLength(120);
  });
});
