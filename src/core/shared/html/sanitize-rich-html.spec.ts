import { describe, expect, it } from '@jest/globals';
import { isRichHtml, sanitizeRichHtml } from './sanitize-rich-html';

describe('sanitizeRichHtml', () => {
  it('garde la mise en forme de l’éditeur (gras, couleurs, surlignage, alignement, listes, liens)', () => {
    const html = '<h2 style="text-align: center">Objet</h2><p>Bonjour <strong>Jean</strong>, <span style="color: #b91c1c">urgent</span> '
      + '<mark data-color="#fef08a" style="background-color: #fef08a; color: inherit">à lire</mark></p>'
      + '<ul data-variant="dash"><li><p>CNI</p></li></ul><p><a href="https://app.exemple.cm/dossiers/37" target="_blank">DOS-2026-0037</a></p>';
    expect(sanitizeRichHtml(html)).toBe(
      '<h2 style="text-align: center">Objet</h2><p>Bonjour <strong>Jean</strong>, <span style="color: #b91c1c">urgent</span> '
      + '<span style="background-color: #fef08a">à lire</span></p>'
      + '<ul><li><p>CNI</p></li></ul><p><a href="https://app.exemple.cm/dossiers/37" target="_blank" rel="noopener noreferrer">DOS-2026-0037</a></p>',
    );
  });

  it('retire scripts, gestionnaires d’événements, liens javascript: et styles dangereux', () => {
    const html = '<p onclick="alert(1)" style="background-image: url(javascript:x); color: red">a</p>'
      + '<script>alert(1)</script><img src=x onerror=alert(1)><a href="javascript:alert(1)">lien</a>'
      + '<iframe src="https://x"></iframe><style>p{}</style>';
    const clean = sanitizeRichHtml(html);
    expect(clean).toBe('<p style="color: red">a</p><a>lien</a>');
    expect(clean).not.toMatch(/script|onerror|onclick|javascript|iframe|url\(/i);
  });

  it('échappe les chevrons isolés du texte', () => {
    expect(sanitizeRichHtml('<p>a < b et c > d</p>')).toBe('<p>a &lt; b et c &gt; d</p>');
  });

  it('reconnaît un texte mis en forme, pas le balisage léger de l’IA', () => {
    expect(isRichHtml('<p>Bonjour</p>')).toBe(true);
    expect(isRichHtml('**Bonjour**\n\n- CNI')).toBe(false);
  });
});
