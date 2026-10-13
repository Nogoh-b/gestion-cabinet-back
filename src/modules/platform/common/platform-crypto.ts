import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'crypto';
import { requireSecret } from 'src/core/config/secrets';

/**
 * Secret de signature des jetons plateforme — DISTINCT de JWT_SECRET.
 *
 * En production : PLATFORM_JWT_SECRET obligatoire et différent de JWT_SECRET.
 * En développement : à défaut, dérivé de JWT_SECRET (reste distinct du secret
 * cabinet, donc un jeton cabinet ne valide jamais une route plateforme).
 */
let cachedSecret: string | null = null;

export function getPlatformJwtSecret(): string {
  if (cachedSecret) return cachedSecret;
  cachedSecret = resolvePlatformJwtSecret();
  return cachedSecret;
}

function resolvePlatformJwtSecret(): string {
  const value = requireSecret(
    'PLATFORM_JWT_SECRET',
    process.env.PLATFORM_JWT_SECRET,
  );
  if (value) {
    if (
      process.env.NODE_ENV === 'production' &&
      value === process.env.JWT_SECRET
    ) {
      throw new Error(
        '[SECURITE] PLATFORM_JWT_SECRET doit être différent de JWT_SECRET.',
      );
    }
    return value;
  }
  const base = process.env.JWT_SECRET || 'kabysoft-dev-only';
  return createHash('sha256').update(`platform:${base}`).digest('hex');
}

export function getPlatformJwtExpiresIn(): string {
  return process.env.PLATFORM_JWT_EXPIRES_IN || '8h';
}

/** HMAC-SHA256 (hex) d'un jeton/code, poivré par le secret plateforme. */
export function hmacToken(value: string): string {
  return createHmac('sha256', getPlatformJwtSecret())
    .update(String(value))
    .digest('hex');
}

export function safeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(String(a), 'hex');
  const right = Buffer.from(String(b), 'hex');
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}

/** Jeton opaque URL-safe. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** Code OTP numérique à 6 chiffres. */
export function generateOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

/** Politique de mot de passe des comptes plateforme. */
export function assertStrongPassword(password: string): string | null {
  const value = String(password ?? '');
  if (value.length < 12) return 'Le mot de passe doit contenir au moins 12 caractères.';
  if (!/[a-z]/.test(value)) return 'Le mot de passe doit contenir une minuscule.';
  if (!/[A-Z]/.test(value)) return 'Le mot de passe doit contenir une majuscule.';
  if (!/\d/.test(value)) return 'Le mot de passe doit contenir un chiffre.';
  if (!/[^A-Za-z0-9]/.test(value)) return 'Le mot de passe doit contenir un caractère spécial.';
  return null;
}

export function frontendBaseUrl(): string {
  return String(
    process.env.APP_FRONTEND_URL ?? process.env.FRONTEND_URL ?? '',
  ).replace(/\/+$/, '');
}

export function maskEmail(email: string): string {
  const [user, domain] = String(email ?? '').split('@');
  if (!domain) return email;
  const visible = user.slice(0, 2);
  return `${visible}${'•'.repeat(Math.max(1, user.length - 2))}@${domain}`;
}
