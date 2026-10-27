/// <reference types="jest" />
import { recordCitedEarlier } from './skill-helpers';

// 25/10/2026 : « rédige un document sous la base de ce modèle facture client »
// après une lecture des factures du dossier CD-2026-003.
describe('fiche citée plus tôt dans la conversation', () => {
  const readAnswer = {
    role: 'assistant',
    content: 'Facture FAC-2026-0001 — Client : Patrick Talla — Dossier CD-2026-003',
    refs: [
      { entity: 'factures', type: 'facture', id: 7, label: 'FAC-2026-0001' },
      { entity: 'dossiers', type: 'dossier', id: 3, label: 'CD-2026-003' },
      { entity: 'customer', type: 'client', id: 12, label: 'Patrick Talla' },
    ],
  };

  it('la seule fiche du type dans le message le plus récent qui en cite', () => {
    const history = [{ role: 'user', content: 'factures du dossier CD-2026-003' }, readAnswer];
    expect(recordCitedEarlier(history, 'facture')).toMatchObject({ type: 'facture', table: 'factures', id: 7, label: 'FAC-2026-0001' });
    expect(recordCitedEarlier(history, 'dossier')).toMatchObject({ id: 3 });
    expect(recordCitedEarlier(history, 'audience')).toBeUndefined();
  });

  it('plusieurs fiches du type : celle que la demande nomme, sinon aucune', () => {
    const two = {
      ...readAnswer,
      refs: [...readAnswer.refs, { entity: 'factures', type: 'facture', id: 8, label: 'FAC-2026-0002' }],
    };
    expect(recordCitedEarlier([two], 'facture')).toBeUndefined();
    expect(recordCitedEarlier([two], 'facture', 'remplis le modèle pour FAC-2026-0002')).toMatchObject({ id: 8 });
  });

  it('le message le plus récent tranche, les plus anciens ne comptent plus', () => {
    const later = { role: 'assistant', content: 'Facture FAC-2026-0009', refs: [{ type: 'facture', id: 9, label: 'FAC-2026-0009' }] };
    expect(recordCitedEarlier([readAnswer, later], 'facture')).toMatchObject({ id: 9 });
    expect(recordCitedEarlier(undefined, 'facture')).toBeUndefined();
  });
});
