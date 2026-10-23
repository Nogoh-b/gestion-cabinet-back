/// <reference types="jest" />
import { changesAnything, kindWords, labelHasWord, pageOnlyTargets, refersToOpenPage } from './vague-target';

const update = (entity: string, entityId: number, fields: Record<string, any> = {}) => ({
  operation: 'UPDATE',
  entity,
  entityId,
  fields,
});

const page = new Set(['document_customer#36']);
const none = new Set<string>();

describe('pageOnlyTargets — cible devinée à partir de la page', () => {
  it('« je veux modifier un modèle de document » ne désigne pas le document de la page', () => {
    const found = pageOnlyTargets([update('document_customer', 36)], 'je veux modifier un modèle de document', page, none);
    expect(found).toEqual([{ index: 0, entity: 'document_customer', id: '36' }]);
  });

  it('« ce document » vise bien la page', () => {
    expect(pageOnlyTargets([update('document_customer', 36)], 'renomme ce document', page, none)).toEqual([]);
    expect(refersToOpenPage('mets à jour celui-ci')).toBe(true);
  });

  it('un numéro tapé ou une cible mentionnée (@) n’est pas une devinette', () => {
    expect(pageOnlyTargets([update('document_customer', 36)], 'modifie le document 36', page, none)).toEqual([]);
    expect(pageOnlyTargets([update('document_customer', 36)], 'modifie le document', page, new Set(['document_customer#36']))).toEqual([]);
  });

  it('une cible qui ne vient pas de la page n’est pas concernée', () => {
    expect(pageOnlyTargets([update('dossiers', 91)], 'modifie le dossier', page, none)).toEqual([]);
  });

  it('les créations et les cibles par « match » sont ignorées', () => {
    const operations = [
      { operation: 'INSERT', entity: 'document_customer', fields: {} },
      { operation: 'UPDATE', entity: 'document_customer', match: { name: 'Doc' }, fields: {} },
    ];
    expect(pageOnlyTargets(operations, 'modifie le document', page, none)).toEqual([]);
  });
});

describe('changesAnything — le plan change-t-il quelque chose ?', () => {
  const columns = new Set(['name', 'status']);
  const row = { name: 'Doc', status: 1 };

  it('aucun champ ou valeur identique : rien à changer', () => {
    expect(changesAnything({}, row, columns)).toBe(false);
    expect(changesAnything({ name: 'Doc' }, row, columns)).toBe(false);
    expect(changesAnything({ name: ' doc ', status: '1' }, row, columns)).toBe(false);
  });

  it('une valeur différente est un vrai changement', () => {
    expect(changesAnything({ name: 'Contrat' }, row, columns)).toBe(true);
  });

  it('un champ inconnu ou une fiche introuvable ne bloque pas', () => {
    expect(changesAnything({ autre: 'x' }, row, columns)).toBe(true);
    expect(changesAnything({ name: 'Doc' }, null, columns)).toBe(true);
  });
});

describe('types d’éléments évoqués par la demande', () => {
  it('« modèle » se retrouve dans le libellé des modèles, pas dans celui des documents clients', () => {
    expect(kindWords('je veux modifier un modèle de document')).toEqual(expect.arrayContaining(['modele', 'modifier', 'document']));
    expect(labelHasWord('Modèles de documents PDF', 'modele')).toBe(true);
    expect(labelHasWord('Modèles de mails', 'modele')).toBe(true);
    expect(labelHasWord('Documents clients', 'modele')).toBe(false);
    expect(labelHasWord('Documents clients', 'document')).toBe(true);
  });
});
