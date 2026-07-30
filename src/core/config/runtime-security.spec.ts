import { assertSafeMicroserviceBindHost } from './runtime-security';

describe('runtime security', () => {
  it.each(['0.0.0.0', '::', '[::]', '*'])(
    'refuse le bind TCP global %s en production',
    (host) => {
      expect(() => assertSafeMicroserviceBindHost(host, 'production')).toThrow(
        /interface interne explicite/i,
      );
    },
  );

  it('accepte une interface interne explicite', () => {
    expect(() =>
      assertSafeMicroserviceBindHost('127.0.0.1', 'production'),
    ).not.toThrow();
    expect(() =>
      assertSafeMicroserviceBindHost('10.20.0.8', 'production'),
    ).not.toThrow();
  });

  it('tolere un bind global uniquement hors production', () => {
    expect(() =>
      assertSafeMicroserviceBindHost('0.0.0.0', 'development'),
    ).not.toThrow();
  });
});
