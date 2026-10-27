import { describe, expect, it } from '@jest/globals';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import * as path from 'path';
import { getMetadataArgsStorage } from 'typeorm';
import { Mail } from './entities/mail.entity';
import { MailService } from './emails.service';

/**
 * E-mail envoyé par le chat avec plusieurs pièces de la GED (21/10/2026) :
 * le base64 des pièces dépassait la colonne TEXT, la ligne relue était
 * tronquée (« Unterminated string in JSON at position 65535 »).
 */
describe('Pièces jointes des e-mails', () => {
  const transformer = getMetadataArgsStorage().columns.find(
    (column) => column.target === Mail && column.propertyName === 'attachments',
  )!.options.transformer as any;

  it('relit une liste tronquée sans casser l’historique, et la signale', () => {
    expect(transformer.from('[{"filename":"a.pdf","content":"JVBERi0xLj')).toEqual([
      { filename: 'Pièces jointes illisibles', unreadable: true },
    ]);
    expect(transformer.from(null)).toBeUndefined();
    expect(transformer.from('[{"filename":"a.pdf","path":"uploads/a.pdf"}]')).toEqual([{ filename: 'a.pdf', path: 'uploads/a.pdf' }]);
    expect(transformer.to([{ filename: 'a.pdf', path: 'uploads/a.pdf' }])).toBe('[{"filename":"a.pdf","path":"uploads/a.pdf"}]');
  });

  describe('lecture à l’envoi', () => {
    const service = Object.create(MailService.prototype) as MailService;
    const prepare = (docs: any[]) => (service as any).prepareAttachmentsWithBuffers(docs);
    const dir = path.join(process.cwd(), 'uploads', '__spec_mail_attachments__');

    beforeAll(() => {
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, 'piece.pdf'), 'PDF');
    });
    afterAll(() => rmSync(dir, { recursive: true, force: true }));

    it('lit une pièce de la GED rangée sous uploads/', async () => {
      const [attachment] = await prepare([
        { filename: 'Pièce.pdf', path: 'uploads/__spec_mail_attachments__/piece.pdf', contentType: 'application/pdf' },
      ]);
      expect(attachment.filename).toBe('Pièce.pdf');
      expect(Buffer.isBuffer(attachment.content)).toBe(true);
      expect(attachment.content.toString()).toBe('PDF');
    });

    it('refuse un chemin hors de uploads/', async () => {
      await expect(prepare([{ filename: 'x', path: '../package.json' }])).rejects.toThrow('refusée');
      await expect(prepare([{ filename: 'x', path: path.join(process.cwd(), 'package.json') }])).rejects.toThrow('refusée');
    });

    it('échoue sur une liste illisible au lieu d’envoyer sans pièce', async () => {
      await expect(prepare([{ filename: 'Pièces jointes illisibles', unreadable: true }])).rejects.toThrow('illisibles');
    });
  });
});
