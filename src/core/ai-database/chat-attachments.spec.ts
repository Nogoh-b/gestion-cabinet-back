import {
  documentCoverage,
  documentFocus,
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

describe('documentFocus — document repris après plusieurs messages', () => {
  const fiche = [{
    name: 'IMG_20260824_174817.jpg.jpeg',
    content: 'CABINET D AVOCATS FRANCIS EBIANG\nTEL +237.233.42.80.90\nEmail : feb@cfe.cm\nAffaire OVAMBE NDONO — trouble de jouissance',
  }];

  it.each([
    ['li bien le contenu', 'reading'],
    ['relis-le stp', 'reading'],
    ["l'adresse mail du cabinet c'est quoi ?", 'content'],
    ['le téléphone du cabinet Francis ?', 'content'],
    ['résume ce document', 'explicit'],
  ])('suit le document : %s', (question, reason) => {
    expect(documentFocus(question, fiche)).toBe(reason);
  });

  it('suit le document juste après une réponse fondée sur lui', () => {
    expect(documentFocus('je veux créer le dossier là', fiche)).toBeNull();
    expect(documentFocus('je veux créer le dossier là', fiche, { previousAnswerUsedDocument: true })).toBe('previous');
    // Une question de droit générale ne suit pas le document par simple proximité.
    expect(documentFocus("quels sont les délais d'appel au Cameroun ?", fiche, {
      previousAnswerUsedDocument: true,
      knowledgeQuestion: true,
    })).toBeNull();
  });

  it.each([
    'combien de dossiers ouverts ?',
    'liste mes audiences de demain',
    'affiche toutes les factures impayées',
    'bonjour, ça va ?',
    'merci beaucoup',
  ])('laisse les questions sur les données du cabinet à la base : %s', (question) => {
    expect(documentFocus(question, fiche, { previousAnswerUsedDocument: true })).toBeNull();
  });

  it('renvoie vers la base un numéro absent du document', () => {
    expect(documentFocus('le contenu du dossier DOS-2026-0001', fiche, { recordReference: 'DOS-2026-0001' })).toBeNull();
    expect(documentFocus('le contenu du dossier DOS-2026-0001', [{ name: 'a.pdf', content: 'Réf. DOS-2026-0001' }], {
      recordReference: 'DOS-2026-0001',
    })).toBe('reading');
  });

  it('mesure la part des mots de la question présents dans le document', () => {
    expect(documentCoverage('adresse mail cabinet', fiche[0].content)).toEqual({ coverage: 2 / 3, matched: 2 });
    expect(documentCoverage('bonjour', fiche[0].content).matched).toBe(0);
  });
});
