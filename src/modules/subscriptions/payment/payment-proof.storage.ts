import { BadRequestException, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { existsSync } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import { join, normalize, sep } from 'path';

/**
 * Justificatifs de paiement manuel (reçus de virement, captures Mobile Money).
 * Stockés HORS du dossier public `uploads/` : ils ne sont servis que par des
 * routes authentifiées (cabinet propriétaire ou plateforme).
 */
export const PAYMENT_PROOF_ROOT = join(process.cwd(), 'storage', 'payment-proofs');
const MAX_SIZE = 5 * 1024 * 1024;

const FORMATS: Record<string, { ext: string; check: (b: Buffer) => boolean }> = {
  'application/pdf': { ext: 'pdf', check: (b) => b.subarray(0, 5).toString() === '%PDF-' },
  'image/png': {
    ext: 'png',
    check: (b) => b.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')),
  },
  'image/jpeg': { ext: 'jpg', check: (b) => b.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex')) },
};

export async function savePaymentProof(
  cabinetId: number,
  paymentId: number,
  file: Express.Multer.File,
): Promise<string> {
  if (!file?.buffer?.length || file.size > MAX_SIZE) {
    throw new BadRequestException('Justificatif requis : 5 Mo maximum.');
  }
  const format = FORMATS[file.mimetype];
  if (!format || !format.check(file.buffer)) {
    throw new BadRequestException('Justificatif PDF, PNG ou JPEG valide requis.');
  }
  const dir = join(PAYMENT_PROOF_ROOT, String(cabinetId));
  await mkdir(dir, { recursive: true });
  const name = `${paymentId}-${Date.now()}-${randomBytes(4).toString('hex')}.${format.ext}`;
  await writeFile(join(dir, name), file.buffer);
  return `${cabinetId}/${name}`;
}

export function resolvePaymentProof(relative: string | null): { path: string; mime: string } {
  if (!relative) throw new NotFoundException('Aucun justificatif.');
  const absolute = normalize(join(PAYMENT_PROOF_ROOT, relative));
  if (!absolute.startsWith(PAYMENT_PROOF_ROOT + sep) || !existsSync(absolute)) {
    throw new NotFoundException('Justificatif introuvable.');
  }
  const ext = absolute.split('.').pop()?.toLowerCase();
  const mime =
    ext === 'pdf' ? 'application/pdf' : ext === 'png' ? 'image/png' : 'image/jpeg';
  return { path: absolute, mime };
}
