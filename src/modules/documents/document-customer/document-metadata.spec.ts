import { parseKeywords, withDocumentMeta } from './document-metadata';

describe('document-metadata', () => {
  it('lit les mots-clés en texte ou en tableau JSON, sans doublon', () => {
    expect(parseKeywords('contrat, preuve ; contrat')).toEqual(['contrat', 'preuve']);
    expect(parseKeywords('["bail","quittance"]')).toEqual(['bail', 'quittance']);
    expect(parseKeywords('')).toEqual([]);
  });

  it('range mots-clés et date à plat dans les métadonnées envoyées', () => {
    const metadata = withDocumentMeta(JSON.stringify({ original_filename: 'a.pdf' }), {
      keywords: 'bail, loyer',
      document_date: '2026-09-14T00:00:00.000Z',
    });
    expect(metadata).toEqual({ original_filename: 'a.pdf', keywords: ['bail', 'loyer'], document_date: '2026-09-14' });
  });

  it('garde les valeurs du chat quand rien n’est saisi à plat', () => {
    const metadata = { keywords: ['x'], document_date: '2026-01-02' };
    expect(withDocumentMeta(metadata, {})).toEqual(metadata);
    expect(withDocumentMeta(undefined, {})).toBeUndefined();
  });

  it('une valeur vidée efface la clé ; une date invalide est ignorée', () => {
    expect(withDocumentMeta({ keywords: ['x'], document_date: '2026-01-02', source: 'upload' }, { keywords: '', document_date: 'demain' }))
      .toEqual({ source: 'upload' });
  });
});
