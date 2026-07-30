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

  beforeEach(() => {
    process.env.CORS_ORIGINS = 'https://cabinet.example';
  });

  afterAll(() => {
    process.env.CORS_ORIGINS = previousOrigins;
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
});
