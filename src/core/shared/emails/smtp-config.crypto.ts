import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const AAD = Buffer.from('cabinet-smtp-config:v1', 'utf8');

interface EncryptedSmtpEnvelope {
  version: 1;
  algorithm: 'aes-256-gcm';
  iv: string;
  authTag: string;
  ciphertext: string;
}

function resolveKey(rawKey = process.env.SETTINGS_ENCRYPTION_KEY): Buffer {
  const value = rawKey?.trim();
  if (!value) {
    throw new Error(
      'SETTINGS_ENCRYPTION_KEY est obligatoire pour les configurations SMTP.',
    );
  }

  if (/^[a-f0-9]{64}$/i.test(value)) {
    return Buffer.from(value, 'hex');
  }

  const base64 = Buffer.from(value, 'base64');
  if (base64.length === 32 && base64.toString('base64').replace(/=+$/, '') === value.replace(/=+$/, '')) {
    return base64;
  }

  const utf8 = Buffer.from(value, 'utf8');
  if (utf8.length === 32) return utf8;

  throw new Error(
    'SETTINGS_ENCRYPTION_KEY doit contenir exactement 32 octets (hex, base64 ou UTF-8).',
  );
}

function parseEnvelope(payload: string): EncryptedSmtpEnvelope {
  let envelope: EncryptedSmtpEnvelope;
  try {
    envelope = JSON.parse(payload) as EncryptedSmtpEnvelope;
  } catch {
    throw new Error('Configuration SMTP chiffree illisible.');
  }

  if (
    envelope?.version !== 1 ||
    envelope?.algorithm !== ALGORITHM ||
    !envelope.iv ||
    !envelope.authTag ||
    !envelope.ciphertext
  ) {
    throw new Error('Format de configuration SMTP chiffree invalide.');
  }
  return envelope;
}

export function encryptSmtpConfig(
  config: Record<string, unknown>,
  rawKey?: string,
): string {
  const key = resolveKey(rawKey);
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(AAD);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(config), 'utf8'),
    cipher.final(),
  ]);
  const envelope: EncryptedSmtpEnvelope = {
    version: 1,
    algorithm: ALGORITHM,
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  };
  return JSON.stringify(envelope);
}

export function decryptSmtpConfig<T extends Record<string, unknown>>(
  payload: string,
  rawKey?: string,
): T {
  const envelope = parseEnvelope(payload);
  const decipher = createDecipheriv(
    ALGORITHM,
    resolveKey(rawKey),
    Buffer.from(envelope.iv, 'base64'),
  );
  decipher.setAAD(AAD);
  decipher.setAuthTag(Buffer.from(envelope.authTag, 'base64'));
  let plaintext: Buffer;
  try {
    plaintext = Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
      decipher.final(),
    ]);
  } catch {
    throw new Error(
      'Configuration SMTP impossible a dechiffrer (cle invalide ou donnees alterees).',
    );
  }

  try {
    return JSON.parse(plaintext.toString('utf8')) as T;
  } finally {
    plaintext.fill(0);
  }
}
