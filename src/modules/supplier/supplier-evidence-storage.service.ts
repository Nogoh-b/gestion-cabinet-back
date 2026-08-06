import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  resolve,
  sep,
} from 'path';
import { getCurrentTenantId } from 'src/core/tenant/tenant.context';
import { AntivirusScannerService } from '../documents/document-customer/antivirus-scanner.service';

const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
]);

export interface StoredSupplierEvidence {
  storageKey: string;
  originalName: string;
  mimeType: string;
  size: number;
  sha256: string;
}

@Injectable()
export class SupplierEvidenceStorageService {
  private readonly storageRoot = resolve(
    process.env.PRIVATE_STORAGE_ROOT ??
      join(process.cwd(), 'storage', 'private'),
  );

  constructor(private readonly scanner: AntivirusScannerService) {}

  async store(
    file: Express.Multer.File,
    kind: 'invoice' | 'expense',
  ): Promise<StoredSupplierEvidence> {
    const buffer = file?.buffer;
    if (!buffer?.length) {
      throw new BadRequestException('Justificatif vide');
    }
    if (buffer.length > MAX_EVIDENCE_BYTES) {
      throw new BadRequestException('Justificatif supérieur à 10 Mo');
    }
    const claimedMime = String(file.mimetype ?? '').toLowerCase();
    if (!ALLOWED_MIME_TYPES.has(claimedMime)) {
      throw new BadRequestException(
        'Seuls les justificatifs PDF, JPEG et PNG sont autorisés',
      );
    }
    const detectedMime = this.detectMime(buffer);
    if (detectedMime !== claimedMime) {
      throw new BadRequestException(
        `Type déclaré ${claimedMime} incompatible avec ${detectedMime}`,
      );
    }
    const scan = await this.scanner.scan(buffer);
    if (String(scan.status) !== 'CLEAN') {
      throw new BadRequestException(
        'Justificatif refusé : analyse antivirus non concluante',
      );
    }

    const originalName =
      basename(String(file.originalname ?? 'justificatif'))
        .replace(/[\u0000-\u001f\u007f]/g, '')
        .slice(0, 255) || 'justificatif';
    const extension = extname(originalName).toLowerCase();
    const safeExtension = /^\.(pdf|png|jpe?g)$/.test(extension)
      ? extension
      : detectedMime === 'application/pdf'
        ? '.pdf'
        : detectedMime === 'image/png'
          ? '.png'
          : '.jpg';
    const storageKey =
      `tenants/${getCurrentTenantId()}/supplier-evidence/` +
      `${kind}/${randomUUID()}${safeExtension}`;
    const target = this.resolveStorageKey(storageKey);
    await fs.mkdir(dirname(target), { recursive: true });
    await fs.writeFile(target, buffer, { flag: 'wx' });
    return {
      storageKey,
      originalName,
      mimeType: detectedMime,
      size: buffer.length,
      sha256: createHash('sha256').update(buffer).digest('hex'),
    };
  }

  read(storageKey: string): Promise<Buffer> {
    return fs.readFile(this.resolveStorageKey(storageKey));
  }

  async remove(storageKey: string | null | undefined): Promise<void> {
    if (!storageKey) return;
    await fs.rm(this.resolveStorageKey(storageKey), { force: true });
  }

  private resolveStorageKey(storageKey: string): string {
    if (
      !storageKey ||
      isAbsolute(storageKey) ||
      storageKey.includes('\0') ||
      storageKey.includes('://')
    ) {
      throw new BadRequestException('Clé de justificatif invalide');
    }
    const target = resolve(this.storageRoot, storageKey);
    if (
      target !== this.storageRoot &&
      !target.startsWith(`${this.storageRoot}${sep}`)
    ) {
      throw new BadRequestException('Clé de justificatif invalide');
    }
    return target;
  }

  private detectMime(buffer: Buffer): string {
    if (buffer.subarray(0, 5).toString('ascii') === '%PDF-') {
      return 'application/pdf';
    }
    if (
      buffer.length >= 8 &&
      buffer.subarray(0, 8).equals(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      )
    ) {
      return 'image/png';
    }
    if (
      buffer.length >= 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff
    ) {
      return 'image/jpeg';
    }
    return 'application/octet-stream';
  }
}
