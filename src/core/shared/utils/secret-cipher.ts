import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

/**
 * Chiffrement symétrique (AES-256-GCM) des secrets stockés en base
 * (clés de passerelles de paiement…). Format : `enc:v1:<iv>:<tag>:<data>`.
 *
 * La clé est dérivée (SHA-256) de la variable d'environnement fournie ;
 * à défaut, hors production, de JWT_SECRET.
 */
function keyFrom(envName: string): Buffer {
  const secret =
    process.env[envName] ||
    (process.env.NODE_ENV !== 'production' ? process.env.JWT_SECRET : undefined);
  if (!secret) {
    throw new Error(
      `${envName} est requis pour chiffrer/déchiffrer les secrets stockés en base.`,
    );
  }
  return createHash('sha256').update(secret).digest();
}

export function isEncryptedSecret(value: unknown): boolean {
  return typeof value === 'string' && value.startsWith('enc:v1:');
}

export function encryptSecret(plain: string, envName: string): string {
  const value = String(plain ?? '');
  if (!value || isEncryptedSecret(value)) return value;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFrom(envName), iv);
  const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString('base64url')}:${tag.toString('base64url')}:${data.toString('base64url')}`;
}

export function decryptSecret(value: string, envName: string): string {
  if (!value) return '';
  if (!isEncryptedSecret(value)) return value;
  const [, , iv, tag, data] = value.split(':');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    keyFrom(envName),
    Buffer.from(iv, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(data, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

/** Affichage d'un secret sans le révéler : `••••abcd`. */
export function maskSecret(value: string | null | undefined): string {
  const v = String(value ?? '');
  if (!v) return '';
  return `••••${v.slice(-4)}`;
}
