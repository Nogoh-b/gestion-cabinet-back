import {
  appFrontendUrl,
  entityLinks,
  linksBlock,
  richTextToHtml,
  richTextToPlain,
  stripRichMarkup,
  toWhatsAppMarkup,
} from './skill-helpers';

describe('Mise en forme des messages (e-mail et WhatsApp)', () => {
  it('met en gras et en paragraphes, sans laisser passer de HTML', () => {
    expect(richTextToHtml('**Montant : 500 000 FCFA**\n\nMerci.')).toBe(
      '<p><strong>Montant : 500 000 FCFA</strong></p>\n<p>Merci.</p>',
    );
    expect(richTextToHtml('Bonjour <Jean>,\nLigne 2')).toBe(
      '<p>Bonjour &lt;Jean&gt;,<br>Ligne 2</p>',
    );
    expect(richTextToHtml('****')).toBe('<p>****</p>');
    expect(richTextToHtml('  ')).toBe('');
  });

  it('convertit les liens Markdown et les URLs brutes, en http(s) seulement', () => {
    expect(richTextToHtml('Voir [le dossier](https://app.test/dossiers/91).')).toBe(
      '<p>Voir <a href="https://app.test/dossiers/91">le dossier</a>.</p>',
    );
    expect(richTextToHtml('Voir https://app.test/dossiers/91, merci.')).toBe(
      '<p>Voir <a href="https://app.test/dossiers/91">https://app.test/dossiers/91</a>, merci.</p>',
    );
    expect(richTextToHtml('[interne](/dossiers/91) et [x](javascript:alert(1))')).toBe(
      '<p>interne et x</p>',
    );
  });

  it('décline le texte brut (e-mail) et l’objet (sans URL)', () => {
    expect(richTextToPlain('**Montant** : voir [le dossier](https://app.test/dossiers/91)')).toBe(
      'Montant : voir le dossier (https://app.test/dossiers/91)',
    );
    expect(stripRichMarkup('**Relance** [FAC-1](https://app.test/f/1)')).toBe('Relance FAC-1');
  });

  it('adapte la syntaxe à WhatsApp (*gras*, URL visibles)', () => {
    expect(toWhatsAppMarkup('**Audience demain** : voir [le dossier](https://app.test/dossiers/91)')).toBe(
      '*Audience demain* : voir le dossier (https://app.test/dossiers/91)',
    );
    expect(toWhatsAppMarkup('Rappel https://app.test/dossiers/91')).toBe(
      'Rappel https://app.test/dossiers/91',
    );
  });
});

describe('Liens vers les fiches', () => {
  const env = process.env;
  beforeEach(() => {
    process.env = { ...env };
  });
  afterEach(() => {
    process.env = env;
  });

  it('construit des liens absolus vers le dossier et la facture', () => {
    process.env.APP_FRONTEND_URL = 'https://app.test/';
    expect(appFrontendUrl()).toBe('https://app.test');
    expect(entityLinks([
      { table: 'dossiers', id: 91, label: 'DOS-2026-0001' },
      { table: 'factures', id: 'f-1', label: 'FAC-2026-0003' },
      { table: 'inconnue', id: 1, label: 'X' },
    ])).toEqual([
      { label: 'DOS-2026-0001', url: 'https://app.test/dossiers/91' },
      { label: 'FAC-2026-0003', url: 'https://app.test/facturation/factures/f-1' },
    ]);
    expect(linksBlock(entityLinks([{ table: 'dossiers', id: 91, label: 'DOS-2026-0001' }]))).toContain(
      'DOS-2026-0001 : https://app.test/dossiers/91',
    );
  });

  it('ne propose aucun lien sans URL publique configurée', () => {
    delete process.env.APP_FRONTEND_URL;
    delete process.env.FRONTEND_URL;
    expect(entityLinks([{ table: 'dossiers', id: 91, label: 'DOS-2026-0001' }])).toEqual([]);
    expect(linksBlock([])).toBe('');
  });
});

describe('Mise en forme enrichie (éditeur du chat)', () => {
  it('rend italique, souligné et barré de l’e-mail, sans toucher aux mots composés', () => {
    expect(richTextToHtml('_Important_ : ++signer++ avant le ~~12~~ 15/11, réf. nom_prenom_2026.')).toBe(
      '<p><em>Important</em> : <u>signer</u> avant le <s>12</s> 15/11, réf. nom_prenom_2026.</p>',
    );
    expect(richTextToHtml('**_Urgent_**')).toBe('<p><strong><em>Urgent</em></strong></p>');
  });

  it('rend les listes à tirets, à puces et numérotées, puis les citations', () => {
    const html = richTextToHtml('Factures :\n- FAC-1 : 300 000 FCFA\n- FAC-2\n\n• pièce A\n• pièce B\n\n3. Signer\n4. Payer\n\n> Rappel du jugement');
    expect(html).toContain('<p>Factures :</p>');
    expect(html).toContain('<li style="margin:0 0 4px">&ndash;&nbsp;FAC-1 : 300 000 FCFA</li>');
    expect(html).toMatch(/<ul style="margin:0 0 12px;padding-left:22px"><li[^>]*>pièce A<\/li><li[^>]*>pièce B<\/li><\/ul>/);
    expect(html).toMatch(/<ol style="[^"]*" start="3"><li[^>]*>Signer<\/li><li[^>]*>Payer<\/li><\/ol>/);
    expect(html).toMatch(/<blockquote style="[^"]*">Rappel du jugement<\/blockquote>/);
  });

  it('garde les listes dans le texte brut et l’objet sans marqueurs', () => {
    expect(richTextToPlain('**Factures** :\n- _FAC-1_\n- ~~FAC-2~~')).toBe('Factures :\n- FAC-1\n- FAC-2');
    expect(stripRichMarkup('++Relance++ _urgente_')).toBe('Relance urgente');
  });

  it('WhatsApp : ~barré~, listes conservées, pas de soulignement', () => {
    expect(toWhatsAppMarkup('**Reste dû** :\n- ~~FAC-1~~ réglée\n- ++FAC-2++')).toBe('*Reste dû* :\n- ~FAC-1~ réglée\n- FAC-2');
  });

  it('n’injecte aucune balise, même dans une liste', () => {
    expect(richTextToHtml('- <script>alert(1)</script>')).not.toContain('<script>');
  });
});
