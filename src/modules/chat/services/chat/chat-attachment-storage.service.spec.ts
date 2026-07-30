import { BadRequestException } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { runWithTenantContext } from 'src/core/tenant/tenant.context';
import { ChatAttachmentStorageService } from './chat-attachment-storage.service';

describe('ChatAttachmentStorageService', () => {
  let storageRoot: string;
  let previousStorageRoot: string | undefined;

  beforeEach(() => {
    previousStorageRoot = process.env.PRIVATE_STORAGE_ROOT;
    storageRoot = join(tmpdir(), `chat-attachment-${randomUUID()}`);
    process.env.PRIVATE_STORAGE_ROOT = storageRoot;
  });

  afterEach(async () => {
    if (previousStorageRoot === undefined) {
      delete process.env.PRIVATE_STORAGE_ROOT;
    } else {
      process.env.PRIVATE_STORAGE_ROOT = previousStorageRoot;
    }
    await fs.rm(storageRoot, { recursive: true, force: true });
  });

  const pdfFile = (): Express.Multer.File =>
    ({
      buffer: Buffer.from('%PDF-1.7\nprivate-content'),
      originalname: '../preuve.pdf',
      mimetype: 'application/pdf',
      size: 24,
    }) as Express.Multer.File;

  it('échoue de manière restrictive si l’antivirus est indisponible', async () => {
    const scanner = {
      scan: jest.fn().mockResolvedValue({
        status: 'UNAVAILABLE',
        details: 'scanner absent',
      }),
    };
    const service = new ChatAttachmentStorageService(scanner as any);

    await expect(
      runWithTenantContext(42, () => service.store(pdfFile())),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('détecte le type, calcule l’empreinte et stocke hors répertoire public', async () => {
    const scanner = {
      scan: jest.fn().mockResolvedValue({
        status: 'CLEAN',
        details: null,
      }),
    };
    const service = new ChatAttachmentStorageService(scanner as any);
    const file = pdfFile();

    const stored = await runWithTenantContext(42, () => service.store(file));

    expect(stored.storageKey).toMatch(/^tenants\/42\/chat\/.+\.pdf$/);
    expect(stored.filePath).toBe(stored.storageKey);
    expect(stored.originalName).toBe('preuve.pdf');
    expect(stored.detectedMime).toBe('application/pdf');
    expect(stored.sha256).toBe(
      createHash('sha256').update(file.buffer).digest('hex'),
    );
    await expect(service.read(stored.storageKey)).resolves.toEqual(file.buffer);
    expect((stored as any).fileUrl).toBeUndefined();
  });

  it('refuse un type déclaré incompatible avec le contenu', async () => {
    const scanner = {
      scan: jest.fn().mockResolvedValue({
        status: 'CLEAN',
        details: null,
      }),
    };
    const service = new ChatAttachmentStorageService(scanner as any);
    const file = pdfFile();
    file.mimetype = 'image/png';

    await expect(
      runWithTenantContext(42, () => service.store(file)),
    ).rejects.toThrow(/ne correspond pas au contenu détecté/i);
    expect(scanner.scan).not.toHaveBeenCalled();
  });

  it('refuse toute clé de lecture sortant de la racine privée', async () => {
    const service = new ChatAttachmentStorageService({ scan: jest.fn() } as any);

    await expect(service.read('../secret.txt')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
