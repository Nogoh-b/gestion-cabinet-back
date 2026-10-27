import {
  matchEnumValue,
  parseLenientBoolean,
  parseLenientDate,
  parseLenientNumber,
  parseLenientTime,
} from './lenient-values';

describe('lenient-values', () => {
  describe('parseLenientNumber', () => {
    it.each([
      ['1 500 000 FCFA', 1500000],
      ['1 500 000', 1500000],
      ['1,5', 1.5],
      ['1.500.000', 1500000],
      ['1 234,56 €', 1234.56],
      ['1,234.56', 1234.56],
      ['12 %', 12],
      ['2,5 millions', 2500000],
      ['60 min', 60],
      ['-200', -200],
      [42, 42],
    ])('%p → %p', (input, expected) => {
      expect(parseLenientNumber(input)).toBe(expected);
    });

    it('renvoie null pour un texte non numérique', () => {
      expect(parseLenientNumber('beaucoup')).toBeNull();
      expect(parseLenientNumber('')).toBeNull();
    });
  });

  describe('parseLenientBoolean', () => {
    it('comprend oui/non et vrai/faux', () => {
      expect(parseLenientBoolean('Oui')).toBe(true);
      expect(parseLenientBoolean('non')).toBe(false);
      expect(parseLenientBoolean('Vrai')).toBe(true);
      expect(parseLenientBoolean('0')).toBe(false);
      expect(parseLenientBoolean('peut-être')).toBeNull();
    });
  });

  describe('parseLenientDate', () => {
    it('lit le format français JJ/MM/AAAA', () => {
      expect(parseLenientDate('15/06/2026')).toBe('2026-06-15');
      expect(parseLenientDate('5-7-26')).toBe('2026-07-05');
    });

    it('lit les mois en toutes lettres', () => {
      expect(parseLenientDate('15 juin 2026')).toBe('2026-06-15');
      expect(parseLenientDate('1er août 2026 à 14h30')).toBe(
        '2026-08-01 14:30:00',
      );
    });

    it("garde l'ISO tel quel et refuse les dates impossibles", () => {
      expect(parseLenientDate('2026-06-15')).toBe('2026-06-15');
      expect(parseLenientDate('31/02/2026')).toBeNull();
      expect(parseLenientDate('n’importe quand')).toBeNull();
    });

    it("comprend aujourd'hui", () => {
      const today = new Date();
      const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      expect(parseLenientDate("aujourd'hui")).toBe(iso);
    });
  });

  describe('parseLenientTime', () => {
    it.each([
      ['14h30', '14:30'],
      ['9h', '09:00'],
      ['14:30:00', '14:30:00'],
      ['8.15', '08:15'],
    ])('%p → %p', (input, expected) => {
      expect(parseLenientTime(input)).toBe(expected);
    });

    it('refuse une heure impossible', () => {
      expect(parseLenientTime('25h00')).toBeNull();
    });
  });

  describe('matchEnumValue', () => {
    enum Status {
      SCHEDULED = 0,
      HELD = 1,
      POSTPONED = 2,
    }
    enum Priority {
      LOW = 'LOW',
      HIGH = 'HIGH',
    }

    it('accepte la valeur, sa forme texte ou le nom de la clé', () => {
      expect(matchEnumValue(2, [0, 1, 2], Status)).toBe(2);
      expect(matchEnumValue('1', [0, 1, 2], Status)).toBe(1);
      expect(matchEnumValue('postponed', [0, 1, 2], Status)).toBe(2);
      expect(matchEnumValue('high', ['LOW', 'HIGH'], Priority)).toBe('HIGH');
    });

    it('renvoie undefined sans correspondance', () => {
      expect(matchEnumValue('urgentissime', ['LOW', 'HIGH'])).toBeUndefined();
    });
  });
});
