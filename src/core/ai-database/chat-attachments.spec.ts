import {
  formatQuotedPassage,
  isDocumentFollowUp,
  parseAttachedDocuments,
  parseQuotedPassage,
  utf8FileName,
} from './chat-attachments';

describe('chat-attachments', () => {
  describe('isDocumentFollowUp', () => {
    it.each([
      'Que dit la clause 4 ?',
      "Quelle est la date indiquée dans le document ?",
      'Qui a signé ce contrat ?',
      'Traduis la page 2',
      "Qu'est-ce qui est écrit sur la photo ?",
      'Résume cette lettre',
      "Et l'article 12 ?",
      'Le montant ci-joint est-il correct ?',
    ])('reprend le document pour « %s »', (question) => {
      expect(isDocumentFollowUp(question)).toBe(true);
    });

    it.each([
      'Combien de dossiers ouverts ce mois-ci ?',
      'Liste mes documents du dossier DOS-2026-0001',
      'Quels sont les courriers en attente ?',
      'Ajoute une audience demain à 9h',
      'Quel est le chiffre d’affaires du cabinet ?',
    ])('laisse « %s » aux données du cabinet', (question) => {
      expect(isDocumentFollowUp(question)).toBe(false);
    });

    it('reconnaît le nom du fichier joint', () => {
      expect(isDocumentFollowUp('Que pense-tu de Bail_Kouame ?', [{ name: 'Bail_Kouame.pdf' }])).toBe(true);
      expect(isDocumentFollowUp('Combien de clients ?', [{ name: 'Bail_Kouame.pdf' }])).toBe(false);
    });

    it('reconnaît le document par les mots de son titre, au singulier', () => {
      const facture = [{ name: 'IMG_2041.jpg', content: '\nFacture N° 2026-118 du 12 octobre 2026\nTotal TTC' }];
      expect(isDocumentFollowUp('Quel est le montant de la TVA indiqué sur la facture ?', facture)).toBe(true);
      expect(isDocumentFollowUp('Liste ces factures impayées', facture)).toBe(false);
      expect(isDocumentFollowUp('Combien de dossiers en cours ?', facture)).toBe(false);
      expect(isDocumentFollowUp('Qui est le bailleur dans ce bail ?', [{ name: 'Contrat_bail_Kouame.pdf' }])).toBe(true);
    });
  });

  describe('parseAttachedDocuments', () => {
    it('ne garde que les documents lisibles, bornés', () => {
      const raw = JSON.stringify([
        { name: 'facture.png', type: 'image/png', content: 'Total 1 250 000', carried: true },
        { name: 'vide.pdf', content: '   ' },
        { name: 'x'.repeat(500), content: 'a'.repeat(30000) },
        'texte',
      ]);
      const docs = parseAttachedDocuments(raw);
      expect(docs).toHaveLength(2);
      expect(docs[0]).toEqual({ name: 'facture.png', type: 'image/png', content: 'Total 1 250 000', carried: true });
      expect(docs[1].name).toHaveLength(200);
      expect(docs[1].content).toHaveLength(20000);
      expect(docs[1].carried).toBe(false);
    });

    it('ignore un JSON invalide', () => {
      expect(parseAttachedDocuments('{')).toEqual([]);
      expect(parseAttachedDocuments(undefined)).toEqual([]);
    });
  });

  it('relit en UTF-8 un nom de fichier décodé en latin1 par multer', () => {
    const mangled = Buffer.from('Capture 16-10 à 15h20.png', 'utf8').toString('latin1');
    expect(utf8FileName(mangled)).toBe('Capture 16-10 à 15h20.png');
    expect(utf8FileName('facture.png')).toBe('facture.png');
    // Un vrai nom latin1 (octet isolé, UTF-8 invalide) n'est pas abîmé.
    expect(utf8FileName('Résumé.pdf')).toBe('Résumé.pdf');
  });

  it('formate le passage cité avec sa source', () => {
    expect(parseQuotedPassage('  ', 'x')).toBeNull();
    const quote = parseQuotedPassage(' Le bail prend effet le 1er mars. ', 'Bail.pdf\n');
    expect(quote).toEqual({ text: 'Le bail prend effet le 1er mars.', source: 'Bail.pdf' });
    expect(formatQuotedPassage(quote!)).toContain('(source : Bail.pdf)');
    expect(formatQuotedPassage(quote!)).toContain('Le bail prend effet le 1er mars.');
  });
});
