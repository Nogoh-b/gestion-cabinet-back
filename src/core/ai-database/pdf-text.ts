/**
 * Couche texte d'un PDF, page après page (pdf-parse).
 *
 * Le pdf.js embarqué par pdf-parse lit le tampon sous-jacent depuis son début
 * et ignore `byteOffset`. Or Node découpe les petits fichiers (< 4 Ko : une
 * fiche d'une page générée par reportlab, par exemple) dans un tampon partagé :
 * toutes les positions de la table xref sont alors décalées et la lecture
 * échoue en « bad XRef entry ». On lui passe donc une copie qui commence à 0.
 */
export async function extractPdfText(pdf: Buffer): Promise<string> {
  const pdfParse = require('pdf-parse');
  const data = await pdfParse(new Uint8Array(pdf));
  return (data.text || '').trim();
}
