import { BadRequestException } from '@nestjs/common';
import {
  audienceLegacyParts,
  normalizeAudienceSchedule,
  zonedLocalDateTimeToUtc,
} from './audience-schedule.util';

describe('Audience schedule UTC', () => {
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
