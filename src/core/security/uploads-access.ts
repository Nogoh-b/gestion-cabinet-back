import { createHmac, timingSafeEqual } from 'crypto';
import { NextFunction, Request, Response } from 'express';

/**
 * Contrôle d'accès à `/uploads`.
 *
 *  - `uploads/cabinets/…` (logos) reste PUBLIC : affiché dans les e-mails et sur
 *    la page de connexion, sans session.
 *  - Tout le reste (pièces de dossiers, justificatifs, pièces jointes du chat,
 *    exports…) n'est servi que sur une URL SIGNÉE à durée limitée
 *    (`?exp=…&sig=…`). Un navigateur ne peut pas joindre d'en-tête
 *    `Authorization` à un `<img src>` ou un `window.open` : c'est donc l'API qui
 *    signe les URLs `/uploads` qu'elle renvoie (voir
 *    `SignUploadUrlsInterceptor`), uniquement dans des réponses déjà
 *    authentifiées et filtrées par cabinet. L'arborescence disque ne permet pas
 *    de déduire le cabinet d'un chemin (dossier = nom du cabinet, ou rien pour
 *    le chat) : la vérification du cabinet se fait donc à l'émission de l'URL.
 */

/** Seul sous-dossier public de `uploads/`. */
export const PUBLIC_UPLOAD_PREFIXES = ['cabinets/'];

const DEFAULT_TTL_SECONDS = 12 * 60 * 60;

function signingKey(): string {
  return process.env.UPLOADS_SIGNING_SECRET || process.env.JWT_SECRET || '';
}

function ttlSeconds(): number {
  const raw = Number(process.env.UPLOADS_URL_TTL_SECONDS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TTL_SECONDS;
}

/** Chemin relatif sous `uploads/` décodé et normalisé, ou null s'il est suspect. */
export function normalizeUploadPath(rawPath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(rawPath);
  } catch {
    return null;
  }
  if (decoded.includes('\0') || decoded.includes('\\')) return null;
  const segments = decoded.split('/').filter((segment) => segment !== '');
  if (!segments.length || segments.some((s) => s === '.' || s === '..')) {
    return null;
  }
  return segments.join('/');
}

export function isPublicUploadPath(relPath: string): boolean {
  return PUBLIC_UPLOAD_PREFIXES.some((prefix) => relPath.startsWith(prefix));
}

function computeSignature(relPath: string, exp: number): string {
  return createHmac('sha256', signingKey())
    .update(`${relPath}\n${exp}`)
    .digest('hex');
}

export function verifyUploadSignature(
  relPath: string,
  exp: unknown,
  sig: unknown,
  now: number = Date.now(),
): boolean {
  const expiresAt = Number(exp);
  if (typeof sig !== 'string' || !Number.isFinite(expiresAt)) return false;
  if (expiresAt * 1000 < now) return false;
  const expected = Buffer.from(computeSignature(relPath, expiresAt));
  const received = Buffer.from(sig);
  return (
    expected.length === received.length && timingSafeEqual(expected, received)
  );
}

// Les URLs stockées en base ne sont pas encodées : espaces et accents autorisés.
const UPLOAD_URL = /^(https?:\/\/[^/\s?#]+)?\/uploads\/([^?#]+)$/;

/**
 * Transforme une URL `/uploads/…` (absolue ou relative) en URL signée. Les
 * URLs publiques, déjà signées ou étrangères à `/uploads` sont renvoyées telles
 * quelles.
 */
export function signUploadUrl(url: string, now: number = Date.now()): string {
  const match = UPLOAD_URL.exec(url);
  if (!match) return url;
  const relPath = normalizeUploadPath(match[2]);
  if (!relPath || isPublicUploadPath(relPath)) return url;
  const exp = Math.floor(now / 1000) + ttlSeconds();
  const encodedPath = relPath.split('/').map(encodeURIComponent).join('/');
  return `${match[1] ?? ''}/uploads/${encodedPath}?exp=${exp}&sig=${computeSignature(relPath, exp)}`;
}

/**
 * Middleware placé AVANT le service statique : laisse passer les chemins
 * publics et les URLs signées valides, répond 401 sinon.
 */
export function uploadsGuard(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const relPath = normalizeUploadPath(req.path);
  if (!relPath) {
    res.status(400).end();
    return;
  }
  if (
    isPublicUploadPath(relPath) ||
    verifyUploadSignature(relPath, req.query.exp, req.query.sig)
  ) {
    next();
    return;
  }
  res.status(401).json({ message: 'Lien de fichier invalide ou expiré.' });
}
