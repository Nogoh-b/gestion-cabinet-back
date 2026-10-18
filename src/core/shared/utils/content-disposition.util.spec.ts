import { describe, expect, it } from '@jest/globals';

import { inlineContentDisposition } from './content-disposition.util';

/** Ce que Node accepte dans une valeur d'en-tête (latin-1 imprimable). */
const isValidHeaderValue = (value: string) => /^[\t\x20-\x7e\x80-\xff]*$/.test(value);

describe('inlineContentDisposition', () => {
  it('garde un nom simple tel quel', () => {
    expect(inlineContentDisposition('contrat.pdf')).toBe(
      `inline; filename="contrat.pdf"; filename*=UTF-8''contrat.pdf`,
    );
  });

  it("produit un en-tête valide pour l'apostrophe typographique (cause du 500)", () => {
    const header = inlineContentDisposition('Conclusions de l’affaire.pdf');
    expect(isValidHeaderValue(header)).toBe(true);
    expect(header).toContain('filename="Conclusions de l_affaire.pdf"');
    expect(header).toContain("filename*=UTF-8''Conclusions%20de%20l%E2%80%99affaire.pdf");
  });

  it('translittère les accents dans le repli ASCII et garde le vrai nom en UTF-8', () => {
    const header = inlineContentDisposition('Conclusions en défense.docx');
    expect(header).toContain('filename="Conclusions en defense.docx"');
    expect(header).toContain('Conclusions%20en%20d%C3%A9fense.docx');
  });

  it("gère l'arabe sans casser l'en-tête", () => {
    const header = inlineContentDisposition('عقد.pdf');
    expect(isValidHeaderValue(header)).toBe(true);
    expect(header).toContain(`filename*=UTF-8''%D8%B9%D9%82%D8%AF.pdf`);
  });

  it("retire guillemets, antislashs et sauts de ligne (injection d'en-tête)", () => {
    const header = inlineContentDisposition('a"b\\c\r\nSet-Cookie: x=1.pdf');
    expect(header).not.toMatch(/[\r\n\\]/);
    expect(header.match(/"/g)).toHaveLength(2);
  });

  it('retombe sur « document » si le nom est vide', () => {
    expect(inlineContentDisposition('')).toContain('filename="document"');
    expect(inlineContentDisposition(null)).toContain('filename="document"');
  });
});
