import { Logger } from '@nestjs/common';
import { of, throwError } from 'rxjs';

import { LoggingInterceptor } from './logging.interceptor';

describe('LoggingInterceptor', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('retire la query string qui peut contenir un jeton', (done) => {
    const log = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation();
    const interceptor = new LoggingInterceptor();
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'GET',
          originalUrl: '/auth/reset-password?token=secret',
        }),
      }),
    } as any;

    interceptor
      .intercept(context, { handle: () => of(true) } as any)
      .subscribe({
        complete: () => {
          const output = log.mock.calls.flat().join(' ');
          expect(output).not.toContain('secret');
          expect(output).not.toContain('?token=');
          done();
        },
      });
  });

  it('ne journalise pas le message brut d une erreur', (done) => {
    const error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation();
    const interceptor = new LoggingInterceptor();
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'POST',
          originalUrl: '/auth/login',
        }),
      }),
    } as any;

    interceptor
      .intercept(
        context,
        {
          handle: () =>
            throwError(() => ({
              status: 401,
              message: 'mot-de-passe-secret',
            })),
        } as any,
      )
      .subscribe({
        error: () => {
          expect(error.mock.calls.flat().join(' ')).not.toContain(
            'mot-de-passe-secret',
          );
          done();
        },
      });
  });
});
