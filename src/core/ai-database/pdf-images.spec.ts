import { deflateSync } from 'node:zlib';
import { extractPdfJpegImages } from './pdf-images';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9]);

function imageObject(id: number, dictionary: string, data: Buffer): Buffer {
  return Buffer.concat([
    Buffer.from(`${id} 0 obj\n<< /Type /XObject /Subtype /Image ${dictionary} /Length ${data.length} >>\nstream\n`),
    data,
    Buffer.from('\nendstream\nendobj\n'),
  ]);
}

describe('extractPdfJpegImages', () => {
  it('extrait les pages JPEG, y compris compressées, dans l’ordre du fichier', () => {
    const pdf = Buffer.concat([
      Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n'),
      imageObject(2, '/Width 1200 /Height 1700 /Filter /DCTDecode', JPEG),
      imageObject(3, '/Width 1200 /Height 1700 /Filter [/FlateDecode /DCTDecode]', deflateSync(JPEG)),
      Buffer.from('4 0 obj\n<< /Length 9 >>\nstream\nBT ET q Q\nendstream\nendobj\n%%EOF'),
    ]);
    const images = extractPdfJpegImages(pdf);
    expect(images).toHaveLength(2);
    expect(images.every((image) => image.subarray(0, 2).equals(Buffer.from([0xff, 0xd8])))).toBe(true);
  });

  it('ignore logos, signatures et compressions non JPEG', () => {
    const pdf = Buffer.concat([
      imageObject(1, '/Width 120 /Height 80 /Filter /DCTDecode', JPEG),
      imageObject(2, '/Width 2480 /Height 3508 /Filter /CCITTFaxDecode', Buffer.from('fax')),
    ]);
    expect(extractPdfJpegImages(pdf)).toEqual([]);
  });

  it('respecte le nombre maximal de pages', () => {
    const page = imageObject(1, '/Width 1000 /Height 1400 /Filter /DCTDecode', JPEG);
    expect(extractPdfJpegImages(Buffer.concat([page, page, page]), 2)).toHaveLength(2);
  });
});
