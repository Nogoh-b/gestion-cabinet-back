import { isCorsOriginAllowed } from './cors-origin';

describe('isCorsOriginAllowed', () => {
  it('autorise les différents ports loopback en développement', () => {
    expect(isCorsOriginAllowed('http://localhost:3001', [], false)).toBe(true);
    expect(isCorsOriginAllowed('http://127.0.0.1:3010', [], false)).toBe(true);
  });

  it('refuse une origine distante non déclarée', () => {
    expect(isCorsOriginAllowed('https://example.com', [], false)).toBe(false);
  });

  it('exige une origine explicitement déclarée en production', () => {
    expect(
      isCorsOriginAllowed('http://localhost:3001', ['https://app.example.com'], true),
    ).toBe(false);
    expect(
      isCorsOriginAllowed('https://app.example.com', ['https://app.example.com'], true),
    ).toBe(true);
  });

  it('autorise les clients sans en-tête Origin', () => {
    expect(isCorsOriginAllowed(undefined, [], true)).toBe(true);
  });
});
