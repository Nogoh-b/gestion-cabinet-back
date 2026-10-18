import { extractPdfText } from './pdf-text';

/** PDF d'une page avec du texte Helvetica, table xref aux positions exactes. */
function textPdf(lines: string[]): Buffer {
  const content = lines
    .map((line, i) => `BT /F1 12 Tf 60 ${800 - i * 22} Td (${line}) Tj ET`)
    .join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = '%PDF-1.3\n';
  const offsets = objects.map((object, i) => {
    const offset = pdf.length;
    pdf += `${i + 1} 0 obj\n${object}\nendobj\n`;
    return offset;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

const LINES = ['Fiche dossier - Affaire Dupont c/ Martin', 'Reference : DOS-2026-0042'];

describe('extractPdfText', () => {
  it('lit la couche texte d\'un PDF', async () => {
    const text = await extractPdfText(textPdf(LINES));
    expect(text).toContain(LINES[0]);
    expect(text).toContain(LINES[1]);
  });

  it('lit un petit PDF découpé dans un tampon partagé (byteOffset non nul)', async () => {
    // Comme un fichier < 4 Ko reçu par Node : une vue au milieu d'un tampon
    // plus grand. pdf.js seul y lit des positions xref décalées (« bad XRef entry »).
    const pdf = textPdf(LINES);
    const pool = Buffer.alloc(pdf.length + 64, 0x20);
    pdf.copy(pool, 8);
    const pooled = pool.subarray(8, 8 + pdf.length);
    expect(pooled.byteOffset).toBe(8);

    const text = await extractPdfText(pooled);
    expect(text).toContain(LINES[0]);
    expect(text).toContain(LINES[1]);
  });

  it('renvoie un texte vide pour un PDF sans couche texte (repli sur la lecture des pages)', async () => {
    expect(await extractPdfText(textPdf([]))).toBe('');
  });
});
