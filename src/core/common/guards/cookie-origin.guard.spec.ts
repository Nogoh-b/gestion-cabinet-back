import { ForbiddenException } from '@nestjs/common';
import { CookieOriginGuard } from './cookie-origin.guard';

function context(request: any): any {
  return {
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => request }),
  };
}

describe('CookieOriginGuard', () => {
  const previousOrigins = process.env.CORS_ORIGINS;
  const previousNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    process.env.CORS_ORIGINS = 'https://cabinet.example';
    process.env.NODE_ENV = 'test';
  });

  afterAll(() => {
    process.env.CORS_ORIGINS = previousOrigins;
    process.env.NODE_ENV = previousNodeEnv;
  });

  it('refuse une mutation cookie depuis une origine étrangère', () => {
    const guard = new CookieOriginGuard();
    expect(() =>
      guard.canActivate(
        context({
          method: 'POST',
          headers: {
            cookie: 'access_token=signed',
            origin: 'https://attacker.example',
          },
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('autorise une origine explicitement configurée', () => {
    const guard = new CookieOriginGuard();
    expect(
      guard.canActivate(
        context({
          method: 'PATCH',
          headers: {
            cookie: 'access_token=signed',
            origin: 'https://cabinet.example',
          },
        }),
      ),
    ).toBe(true);
  });
  it('autorise un port loopback alternatif en développement', () => {
    const guard = new CookieOriginGuard();
    expect(
      guard.canActivate(
        context({
          method: 'POST',
          headers: {
            cookie: 'access_token=signed',
            origin: 'http://localhost:3001',
          },
        }),
      ),
    ).toBe(true);
  });

  it('n autorise pas implicitement loopback en production', () => {
    process.env.NODE_ENV = 'production';
    const guard = new CookieOriginGuard();
    expect(() =>
      guard.canActivate(
        context({
          method: 'POST',
          headers: {
            cookie: 'access_token=signed',
            origin: 'http://localhost:3001',
          },
        }),
      ),
    ).toThrow(ForbiddenException);
  });
});
