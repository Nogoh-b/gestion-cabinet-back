import {
  chunkLegalText,
  rankLegalKnowledge,
  type LegalKnowledgeDocument,
} from './legal-knowledge';

describe('base de connaissance juridique', () => {
  it('découpe un texte long en passages chevauchants', () => {
    const chunks = chunkLegalText('Article premier. '.repeat(400), 500, 60);
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks.every((chunk) => chunk.length <= 500)).toBe(true);
  });

  it('classe en premier le passage qui répond aux termes de la question', () => {
    const documents: LegalKnowledgeDocument[] = [
      {
        id: 'ohada',
        name: 'Acte uniforme OHADA.pdf',
        imported_at: new Date().toISOString(),
        size: 10,
        character_count: 100,
        chunks: [
          'Le bail commercial organise la jouissance des locaux professionnels.',
          "Le délai d'appel est fixé à trente jours après signification.",
        ],
      },
    ];

    const [match] = rankLegalKnowledge(documents, "Quel est le délai d'appel après signification ?");
    expect(match.chunk).toContain("délai d'appel");
    expect(match.document_name).toBe('Acte uniforme OHADA.pdf');
  });
});
