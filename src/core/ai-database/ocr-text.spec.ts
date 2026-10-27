import { assembleOcrText, correctOcrText, illegibleRatio, readingScore, uncertainWords } from './ocr-text';

describe('ocr-text', () => {
  describe('correctOcrText', () => {
    it('rétablit « 1er » devant un mois ou un article', () => {
      expect(correctOcrText('à compter du ler novembre 2026')).toBe('à compter du 1er novembre 2026');
      expect(correctOcrText("l'alinéa du ler article et la lère instance")).toBe("l'alinéa du 1er article et la 1ère instance");
    });

    it('ne touche pas aux mots ordinaires', () => {
      expect(correctOcrText('Le premier acte est à lire, puis à relier.')).toBe('Le premier acte est à lire, puis à relier.');
      expect(correctOcrText('Société SB Holding, dossier DOS-2026-0001, art. I')).toBe('Société SB Holding, dossier DOS-2026-0001, art. I');
    });

    it('corrige les lettres prises pour des chiffres dans un nombre', () => {
      expect(correctOcrText('Total TTC : 1 25O 000 FCFA, le 12/1O/2O26')).toBe('Total TTC : 1 250 000 FCFA, le 12/10/2026');
      expect(correctOcrText('RCCM CI-ABJ-2O19-B-l4523, à O9:3O')).toBe('RCCM CI-ABJ-2019-B-14523, à 09:30');
      // Identifiants et mots courts : « B2 », « Il », « l'acte » restent tels quels.
      expect(correctOcrText("Il signe au bâtiment B2, l'acte n° 1l")).toBe("Il signe au bâtiment B2, l'acte n° 1l");
    });

    it('retire les lignes de bordure et le bruit', () => {
      expect(correctOcrText('Prestation Heures\n|]  _  |\n——\nTotal 375 000\n\n\n\nFin')).toBe('Prestation Heures\nTotal 375 000\n\nFin');
    });
  });

  it('liste les mots lus avec doute, sans signes ni doublons', () => {
    const words = [
      { text: 'Facture', confidence: 95 },
      { text: 'KOUAMÉ,', confidence: 42 },
      { text: 'KOUAMÉ', confidence: 51 },
      { text: '—', confidence: 10 },
      { text: 'l25O', confidence: 38 },
    ];
    expect(uncertainWords(words)).toEqual(['KOUAMÉ', 'l25O']);
  });

  it('préfère la lecture qui lit le plus de texte avec assurance', () => {
    const complete = [{ text: 'Article', confidence: 92 }, { text: 'premier', confidence: 90 }];
    const partial = [{ text: 'Article', confidence: 95 }, { text: 'prmr', confidence: 40 }];
    expect(readingScore(complete)).toBeGreaterThan(readingScore(partial));
  });
});

describe('assembleOcrText', () => {
  const line = (text: string, x0: number, y0: number, x1: number, y1 = y0 + 20) => ({ text, bbox: { x0, y0, x1, y1 } });

  it("recolle une ligne coupée en deux blocs et la remet à sa place", () => {
    const text = assembleOcrText([
      { paragraphs: [{ lines: [line('Entre le Cabinet', 10, 0, 400), line('été BÉTON-PLUS SARL', 203, 45, 600), line('immatriculée au RCCM', 10, 90, 500)] }] },
      { paragraphs: [{ lines: [line('et la soci', 10, 45, 200)] }] },
    ]);
    expect(text).toBe('Entre le Cabinet\net la société BÉTON-PLUS SARL\nimmatriculée au RCCM');
  });

  it("garde l'interligne normal et marque les vrais paragraphes", () => {
    const text = assembleOcrText([{ paragraphs: [{ lines: [
      line('Article 1', 10, 0, 300), line('suite', 10, 45, 300), line('Article 2', 10, 160, 300),
    ] }] }]);
    expect(text).toBe('Article 1\nsuite\n\nArticle 2');
  });

  it("laisse les colonnes et les lignes verticales dans l'ordre de tesseract", () => {
    const a1 = 'Première colonne, première ligne de texte suivi.';
    const a2 = 'Première colonne, deuxième ligne de texte suivi.';
    const b1 = 'Seconde colonne, première ligne de texte suivi ici.';
    const b2 = 'Seconde colonne, deuxième ligne de texte suivi ici.';
    const columns = assembleOcrText([
      { paragraphs: [{ lines: [line(a1, 10, 0, 500), line(a2, 10, 40, 500)] }] },
      { paragraphs: [{ lines: [line(b1, 600, 0, 1100), line(b2, 600, 40, 1100)] }] },
    ]);
    expect(columns).toBe(`${a1}\n${a2}\n\n${b1}\n${b2}`);
    const vertical = assembleOcrText([
      { paragraphs: [{ lines: [line('ligne 1', 100, 0, 130, 900)] }] },
      { paragraphs: [{ lines: [line('ligne 2', 140, 0, 170, 900)] }] },
    ]);
    expect(vertical).toBe('ligne 1\n\nligne 2');
  });
});

describe('formulaires et tableaux', () => {
  const cell = (text: string, x0: number, y0: number, x1: number) => ({ text, bbox: { x0, y0, x1, y1: y0 + 20 } });

  it("réunit étiquettes et valeurs, dates et événements, dans l'ordre de la page", () => {
    // Tesseract rend un bloc par colonne : étiquettes, dates, puis en-tête et valeurs.
    const text = assembleOcrText([
      { paragraphs: [{ lines: [cell('DOSSIER N° :', 20, 100, 200), cell('NATURE :', 20, 140, 160)] }] },
      { paragraphs: [{ lines: [cell('18.11.24', 20, 300, 140), cell('13.01.25', 20, 340, 140)] }] },
      { paragraphs: [{ lines: [cell('CABINET FRANCIS EBIANG', 300, 20, 800)] }] },
      { paragraphs: [{ lines: [cell('25.10.2024/CFE', 260, 100, 500), cell('Trouble de jouissance', 260, 140, 600)] }] },
      { paragraphs: [{ lines: [cell('Fixation', 260, 300, 400), cell('Renvoi à la demande de la partie civile', 260, 340, 900)] }] },
    ]);
    expect(text).toBe([
      'CABINET FRANCIS EBIANG',
      '',
      'DOSSIER N° : 25.10.2024/CFE',
      'NATURE : Trouble de jouissance',
      '',
      '18.11.24 | Fixation',
      '13.01.25 | Renvoi à la demande de la partie civile',
    ].join('\n'));
  });
});

describe('lecture partielle (écriture manuscrite)', () => {
  const w = (text: string, confidence: number) => ({ text, confidence });

  const bbox = (y: number) => ({ x0: 0, y0: y, x1: 500, y1: y + 20 });
  // Confiances relevées sur une fiche dont les champs sont manuscrits.
  const fiche = [{ paragraphs: [{ lines: [
    { text: 'CABINET FRANCIS EBIANG', bbox: bbox(0), confidence: 91, words: [w('CABINET', 93), w('FRANCIS', 93), w('EBIANG', 90)] },
    { text: 'NATURE : Trouble DUIS ay', bbox: bbox(40), confidence: 67, words: [w('NATURE', 93), w(':', 91), w('Trouble', 61), w('DUIS', 33), w('ay', 56)] },
    { text: 'a Vv ue', bbox: bbox(80), confidence: 71, words: [w('a', 72), w('Vv', 59), w('ue', 67)] },
    { text: '05.05.25 PATE demande vu', bbox: bbox(120), confidence: 77, words: [w('05.05.25', 95), w('PATE', 63), w('demande', 96), w('vu', 54)] },
    { text: 'lado:', bbox: bbox(160), confidence: 0, words: [w('lado:', 0)] },
  ] }] }];

  it('mesure la part du texte douteux, ligne par ligne', () => {
    // Masqués : Trouble, DUIS, ay, a, Vv, ue, vu, lado.
    expect(illegibleRatio(fiche)).toBeCloseTo(24 / 67, 3);
    const printed = [{ paragraphs: [{ lines: [{ text: 'Texte imprimé', bbox: bbox(0), confidence: 95, words: [w('Texte', 96), w('—', 10), w('imprimé', 94)] }] }] }];
    expect(illegibleRatio(printed)).toBe(0);
  });

  it('remplace les passages illisibles au lieu de livrer du bruit au modèle', () => {
    expect(assembleOcrText(fiche, { maskDoubtful: true }))
      .toBe('CABINET FRANCIS EBIANG\nNATURE : [illisible]\n[illisible]\n05.05.25 PATE demande [illisible]\n[illisible]');
  });
});
