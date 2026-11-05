import { BadRequestException } from '@nestjs/common';
import {
  audienceLegacyParts,
  assertAudienceScheduleAllowed,
  isLateAudienceStart,
  normalizeAudienceSchedule,
  rescheduleAudience,
  zonedLocalDateTimeToUtc,
} from './audience-schedule.util';

describe('Audience schedule UTC', () => {
  const planned = {
    starts_at_utc: new Date('2026-08-03T08:30:00.000Z'),
    timezone: 'Africa/Ndjamena',
    audience_date: '2026-08-03',
    audience_time: '09:30:00',
  };

  describe('règles de date', () => {
    const inHours = (hours: number) => new Date(Date.now() + hours * 3_600_000);
    const admin = { role: 'admin' };

    it('refuse une date passée', () => {
      expect(() => assertAudienceScheduleAllowed(inHours(-1), admin)).toThrow('strictement future');
    });

    it('laisse passer une audience au-delà de 48 heures sans droit particulier', () => {
      expect(() => assertAudienceScheduleAllowed(inHours(72), {})).not.toThrow();
    });

    it('exige la dérogation puis un motif sous 48 heures', () => {
      expect(() => assertAudienceScheduleAllowed(inHours(5), {}, 'Motif suffisamment long')).toThrow('dérogation');
      expect(() => assertAudienceScheduleAllowed(inHours(5), admin, 'court')).toThrow('10 caractères');
      expect(() => assertAudienceScheduleAllowed(inHours(5), { permissions: ['schedule_audience_under_48h'] }, 'Fixée par le greffe')).not.toThrow();
    });

    it('ne compte comme tardif qu’un début à venir', () => {
      expect(isLateAudienceStart(inHours(47))).toBe(true);
      expect(isLateAudienceStart(inHours(49))).toBe(false);
      expect(isLateAudienceStart(inHours(-1))).toBe(false);
    });
  });

  it('prend 09:00 quand aucune heure n’est saisie', () => {
    expect(
      normalizeAudienceSchedule({
        audience_date: '2026-08-03',
        timezone: 'Africa/Ndjamena',
      }).startsAtUtc.toISOString(),
    ).toBe('2026-08-03T08:00:00.000Z');
  });

  it('applique la date saisie plutôt que l’instant enregistré', () => {
    const { schedule, moved } = rescheduleAudience(planned, {
      audience_date: '2026-08-05',
      audience_time: '09:30:00',
    });
    expect(schedule.startsAtUtc.toISOString()).toBe('2026-08-05T08:30:00.000Z');
    expect(moved).toBe(true);
  });

  it('ne signale aucun déplacement quand le formulaire renvoie le même horaire', () => {
    expect(
      rescheduleAudience(planned, {
        audience_date: '2026-08-03',
        audience_time: '09:30',
      }).moved,
    ).toBe(false);
  });

  it('compare aussi une ancienne audience sans instant UTC', () => {
    expect(
      rescheduleAudience(
        { ...planned, starts_at_utc: undefined },
        { audience_date: '2026-08-03', audience_time: '09:30' },
      ).moved,
    ).toBe(false);
  });

  it("convertit l'heure civile de N'Djamena en instant UTC", () => {
    expect(
      zonedLocalDateTimeToUtc(
        '2026-08-03',
        '09:30',
        'Africa/Ndjamena',
      ).toISOString(),
    ).toBe('2026-08-03T08:30:00.000Z');
  });

  it('conserve le fuseau comme projection et non comme seconde vérité', () => {
    const result = normalizeAudienceSchedule({
      starts_at_utc: '2026-08-03T08:30:00Z',
      timezone: 'Africa/Ndjamena',
    });

    expect(result.startsAtUtc.toISOString()).toBe(
      '2026-08-03T08:30:00.000Z',
    );
    expect(audienceLegacyParts(result.startsAtUtc, result.timezone)).toEqual({
      legacyDate: '2026-08-03',
      legacyTime: '09:30:00',
    });
  });

  it('refuse un instant ambigu sans décalage UTC explicite', () => {
    expect(() =>
      normalizeAudienceSchedule({
        starts_at_utc: '2026-08-03T08:30:00',
        timezone: 'Africa/Ndjamena',
      }),
    ).toThrow(BadRequestException);
  });

  it('refuse un fuseau non IANA', () => {
    expect(() =>
      normalizeAudienceSchedule({
        starts_at_utc: '2026-08-03T08:30:00Z',
        timezone: 'Cabinet/Locale',
      }),
    ).toThrow(BadRequestException);
  });
});
