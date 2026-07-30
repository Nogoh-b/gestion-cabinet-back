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
import { AntivirusScannerService } from 'src/modules/documents/document-customer/antivirus-scanner.service';

const MAX_CHAT_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'audio/mpeg',
  'audio/ogg',
  'video/mp4',
  'video/webm',
]);

export interface StoredChatAttachment {
  fileName: string;
  originalName: string;
  filePath: string;
  fileSize: number;
  fileType: 'image' | 'document' | 'video' | 'audio' | 'file';
  mimeType: string;
  detectedMime: string;
  storageKey: string;
  sha256: string;
  isUploaded: boolean;
  securityStatus: 'CLEAN';
}

@Injectable()
export class ChatAttachmentStorageService {
  private readonly storageRoot = resolve(
    process.env.PRIVATE_STORAGE_ROOT ?? join(process.cwd(), 'storage', 'private'),
  );

  constructor(private readonly scanner: AntivirusScannerService) {}

  async store(file: Express.Multer.File): Promise<StoredChatAttachment> {
    const buffer = file?.buffer;
    if (!buffer?.length) {
      throw new BadRequestException('Pièce jointe vide.');
    }
    if (buffer.length > MAX_CHAT_ATTACHMENT_BYTES) {
      throw new BadRequestException('Pièce jointe supérieure à 10 Mo.');
    }

    const claimedMime = String(file.mimetype ?? '').toLowerCase();
    if (!ALLOWED_MIME_TYPES.has(claimedMime)) {
      throw new BadRequestException(`Type de pièce jointe interdit : ${claimedMime}`);
    }
    const detectedMime = this.detectMime(buffer, file.originalname);
    if (
      detectedMime === 'application/octet-stream' ||
      !this.mimeCompatible(claimedMime, detectedMime)
    ) {
      throw new BadRequestException(
        `Le type déclaré ${claimedMime} ne correspond pas au contenu détecté ${detectedMime}.`,
      );
    }

    const scan = await this.scanner.scan(buffer);
    if (String(scan.status) !== 'CLEAN') {
      throw new BadRequestException(
        'Pièce jointe refusée : analyse antivirus non concluante.',
      );
    }

    const originalName = this.cleanOriginalName(file.originalname);
    const extension = this.safeExtension(originalName);
    const tenantId = getCurrentTenantId();
    const storageKey = `tenants/${tenantId}/chat/${randomUUID()}${extension}`;
    const target = this.resolveStorageKey(storageKey);
    await fs.mkdir(dirname(target), { recursive: true });
    await fs.writeFile(target, buffer, { flag: 'wx' });

    return {
      fileName: originalName,
      originalName,
      filePath: storageKey,
      fileSize: buffer.length,
      fileType: this.fileTypeOf(detectedMime),
      mimeType: claimedMime,
      detectedMime,
      storageKey,
      sha256: createHash('sha256').update(buffer).digest('hex'),
      isUploaded: true,
      securityStatus: 'CLEAN',
    };
  }

  async read(storageKey: string): Promise<Buffer> {
    return fs.readFile(this.resolveStorageKey(storageKey));
  }

  async remove(storageKey: string): Promise<void> {
    await fs.rm(this.resolveStorageKey(storageKey), { force: true });
  }

  private resolveStorageKey(storageKey: string): string {
    if (!storageKey || isAbsolute(storageKey) || storageKey.includes('\0')) {
      throw new BadRequestException('Clé de stockage de pièce jointe invalide.');
    }
    const target = resolve(this.storageRoot, storageKey);
    if (target !== this.storageRoot && !target.startsWith(`${this.storageRoot}${sep}`)) {
      throw new BadRequestException('Clé de stockage de pièce jointe invalide.');
    }
    return target;
  }

  private cleanOriginalName(value: string): string {
    return basename(String(value ?? 'piece-jointe'))
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .slice(0, 255) || 'piece-jointe';
  }

  private safeExtension(name: string): string {
    const extension = extname(name).toLowerCase();
    return /^\.[a-z0-9]{1,10}$/.test(extension) ? extension : '';
  }

  private mimeCompatible(claimed: string, detected: string): boolean {
    if (claimed === detected) return true;
    if (detected === 'application/x-ole-storage') {
      return [
        'application/msword',
        'application/vnd.ms-excel',
        'application/vnd.ms-powerpoint',
      ].includes(claimed);
    }
    return (
      (claimed === 'text/csv' && detected === 'text/plain') ||
      (claimed === 'audio/mpeg' && detected === 'audio/mpeg')
    );
  }

  private detectMime(buffer: Buffer, originalName: string): string {
    if (buffer.subarray(0, 5).toString('ascii') === '%PDF-') {
      return 'application/pdf';
    }
    if (
      buffer.length >= 8 &&
      buffer.subarray(0, 8).equals(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      )
    ) return 'image/png';
    if (
      buffer.length >= 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff
    ) return 'image/jpeg';
    if (['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString('ascii'))) {
      return 'image/gif';
    }
    if (
      buffer.length >= 12 &&
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP'
    ) return 'image/webp';
    if (
      buffer.length >= 12 &&
      buffer.subarray(4, 8).toString('ascii') === 'ftyp'
    ) return 'video/mp4';
    if (
      buffer.length >= 4 &&
      buffer[0] === 0x1a &&
      buffer[1] === 0x45 &&
      buffer[2] === 0xdf &&
      buffer[3] === 0xa3
    ) return 'video/webm';
    if (buffer.subarray(0, 4).toString('ascii') === 'OggS') {
      return 'audio/ogg';
    }
    if (
      buffer.subarray(0, 3).toString('ascii') === 'ID3' ||
      (buffer.length >= 2 && buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0)
    ) return 'audio/mpeg';
    if (
      buffer.length >= 8 &&
      buffer.subarray(0, 8).equals(
        Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
      )
    ) return 'application/x-ole-storage';
    if (
      buffer.length >= 4 &&
      buffer[0] === 0x50 &&
      buffer[1] === 0x4b &&
      [0x03, 0x05, 0x07].includes(buffer[2])
    ) {
      const index = buffer.toString('latin1');
      if (index.includes('word/')) {
        return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      }
      if (index.includes('xl/')) {
        return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      }
      if (index.includes('ppt/')) {
        return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
      }
      return 'application/octet-stream';
    }
    const sample = buffer.subarray(0, Math.min(buffer.length, 8192));
    const printable = [...sample].filter(
      byte =>
        byte === 9 ||
        byte === 10 ||
        byte === 13 ||
        (byte >= 32 && byte < 127),
    ).length;
    if (sample.length > 0 && printable / sample.length > 0.95) {
      return extname(originalName).toLowerCase() === '.csv'
        ? 'text/csv'
        : 'text/plain';
    }
    return 'application/octet-stream';
  }

  private fileTypeOf(
    mimeType: string,
  ): StoredChatAttachment['fileType'] {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (
      mimeType.startsWith('text/') ||
      mimeType.includes('pdf') ||
      mimeType.includes('word') ||
      mimeType.includes('excel') ||
      mimeType.includes('sheet') ||
      mimeType.includes('powerpoint') ||
      mimeType.includes('presentation') ||
      mimeType === 'application/x-ole-storage'
    ) return 'document';
    return 'file';
  }
}
