import { timingSafeEqual } from 'crypto';
import { NextFunction, Request, Response } from 'express';

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Protège le tableau Bull Board (`/admin/queues`) par Basic Auth.
 *
 *  - BULL_BOARD_USER / BULL_BOARD_PASSWORD définis → identifiants exigés.
 *  - Non définis → accessible hors production uniquement (404 en production).
 */
export function bullBoardAuth(req: Request, res: Response, next: NextFunction) {
  const user = process.env.BULL_BOARD_USER;
  const password = process.env.BULL_BOARD_PASSWORD;

  if (!user || !password) {
    if (process.env.NODE_ENV === 'production') {
      res.status(404).end();
      return;
    }
    next();
    return;
  }

  const header = req.headers.authorization ?? '';
  if (header.startsWith('Basic ')) {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const sep = decoded.indexOf(':');
    if (
      sep > 0 &&
      safeEqual(decoded.slice(0, sep), user) &&
      safeEqual(decoded.slice(sep + 1), password)
    ) {
      next();
      return;
    }
  }
  res.setHeader('WWW-Authenticate', 'Basic realm="queues"');
  res.status(401).end();
}
