import { buildCurrentDateLine, withCurrentDate } from './current-date';

describe('current-date', () => {
  it('donne la date du jour en français dans le fuseau demandé', () => {
    // 2026-10-17 23:30 UTC = 2026-10-18 01:30 à Paris
    const line = buildCurrentDateLine(new Date('2026-10-17T23:30:00Z'), 'Europe/Paris');
    expect(line).toContain('dimanche 18 octobre 2026');
    expect(line).toContain('2026-10-18');
  });

  it('retombe sur UTC si le fuseau est invalide', () => {
    const line = buildCurrentDateLine(new Date('2026-10-18T12:00:00Z'), 'Mars/Olympus');
    expect(line).toContain('fuseau UTC');
    expect(line).toContain('2026-10-18');
  });

  it('ajoute la date après un prompt existant', () => {
    const prompt = withCurrentDate('Tu es un assistant.', new Date('2026-10-18T12:00:00Z'));
    expect(prompt.startsWith('Tu es un assistant.\n\nDate du jour : ')).toBe(true);
  });
});
