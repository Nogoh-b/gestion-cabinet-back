import { inflateSync } from 'node:zlib';

/** Une page numérisée plus petite est un logo ou une signature, pas une page. */
const MIN_PAGE_SIDE = 300;

/**
 * Images JPEG (DCTDecode) d'un PDF numérisé, dans l'ordre du fichier.
 *
 * Un scanner ou une application photo produit en général une image JPEG par
 * page : c'est ce qu'on lit par OCR quand le PDF n'a pas de couche texte. Les
 * autres compressions de scan (CCITT, JBIG2, JPEG 2000) ne sont pas décodées.
 */
export function extractPdfJpegImages(pdf: Buffer, maxImages = 10): Buffer[] {
  const source = pdf.toString('latin1');
  const images: Buffer[] = [];
  const streamStart = /stream\r?\n/g;
  let match: RegExpExecArray | null;

  while (images.length < maxImages && (match = streamStart.exec(source))) {
    const dataStart = match.index + match[0].length;
    const dataEnd = source.indexOf('endstream', dataStart);
    if (dataEnd < 0) break;
    streamStart.lastIndex = dataEnd + 'endstream'.length;

    // Le dictionnaire d'un flux est toujours celui de l'objet qui le contient.
    const dictionary = source.slice(source.lastIndexOf('obj', match.index), match.index);
    if (!/\/Subtype\s*\/Image\b/.test(dictionary) || !/\/DCTDecode\b/.test(dictionary)) continue;
    const width = Number(dictionary.match(/\/Width\s+(\d+)/)?.[1] ?? 0);
    const height = Number(dictionary.match(/\/Height\s+(\d+)/)?.[1] ?? 0);
    if (Math.min(width, height) < MIN_PAGE_SIDE) continue;

    let data = pdf.subarray(dataStart, dataEnd);
    // `[/FlateDecode /DCTDecode]` : le JPEG est lui-même compressé.
    if (/\/FlateDecode\b/.test(dictionary)) {
      try {
        data = inflateSync(data);
      } catch {
        continue;
      }
    }
    if (data[0] === 0xff && data[1] === 0xd8) images.push(Buffer.from(data));
  }

  return images;
}
