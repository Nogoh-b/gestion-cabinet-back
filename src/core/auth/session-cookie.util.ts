import { CookieOptions, Request, Response } from 'express';

export const ACCESS_COOKIE = 'access_token';
export const REFRESH_COOKIE = 'refresh_token';
export const PASSWORD_RESET_COOKIE = 'password_reset_token';

export interface SessionTokenPair {
  accessToken: string;
  refreshToken: string;
}

export function readCookie(req: Request, name: string): string | null {
  const raw = req.headers.cookie;
  if (!raw) return null;

  for (const part of raw.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    const key = part.slice(0, separator).trim();
    if (key !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

function baseCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
  };
}

export function setSessionCookies(
  response: Response,
  tokens: SessionTokenPair,
): void {
  response.cookie(ACCESS_COOKIE, tokens.accessToken, {
    ...baseCookieOptions(),
    maxAge: 15 * 60 * 1000,
  });
  response.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    ...baseCookieOptions(),
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

export function clearSessionCookies(response: Response): void {
  response.clearCookie(ACCESS_COOKIE, baseCookieOptions());
  response.clearCookie(REFRESH_COOKIE, baseCookieOptions());
}

function passwordResetCookieOptions(): CookieOptions {
  return {
    ...baseCookieOptions(),
    path: '/auth',
  };
}

export function setPasswordResetCookie(
  response: Response,
  token: string,
): void {
  response.cookie(PASSWORD_RESET_COOKIE, token, {
    ...passwordResetCookieOptions(),
    maxAge: 10 * 60 * 1000,
  });
}

export function clearPasswordResetCookie(response: Response): void {
  response.clearCookie(
    PASSWORD_RESET_COOKIE,
    passwordResetCookieOptions(),
  );
}
