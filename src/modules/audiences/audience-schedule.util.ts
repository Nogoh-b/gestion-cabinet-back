import { BadRequestException } from '@nestjs/common';

export const DEFAULT_AUDIENCE_TIMEZONE =
  process.env.DEFAULT_LEGAL_TIMEZONE || 'Africa/Ndjamena';

export interface AudienceScheduleInput {
  starts_at_utc?: string | Date;
  timezone?: string;
  audience_date?: string | Date;
  audience_time?: string;
}

export interface NormalizedAudienceSchedule {
  startsAtUtc: Date;
  timezone: string;
  legacyDate: string;
  legacyTime: string;
}

function datePartsInZone(date: Date, timezone: string): Record<string, number> {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  return Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  );
}

export function assertIanaTimezone(timezone: string): void {
  try {
    new Intl.DateTimeFormat('fr-FR', { timeZone: timezone }).format();
  } catch {
    throw new BadRequestException(`Fuseau horaire IANA invalide : ${timezone}`);
  }
}

/**
 * Convertit une date/heure civile située dans un fuseau IANA vers UTC sans
 * dépendre du fuseau du serveur. Les heures inexistantes lors d'un changement
 * d'heure sont refusées.
 */
export function zonedLocalDateTimeToUtc(
  datePart: string,
  timePart: string,
  timezone: string,
): Date {
  assertIanaTimezone(timezone);
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePart);
  const timeMatch = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(timePart);
  if (!dateMatch || !timeMatch) {
    throw new BadRequestException(
      "La date et l'heure doivent respecter YYYY-MM-DD et HH:mm[:ss]",
    );
  }
  const desired = {
    year: Number(dateMatch[1]),
    month: Number(dateMatch[2]),
    day: Number(dateMatch[3]),
    hour: Number(timeMatch[1]),
    minute: Number(timeMatch[2]),
    second: Number(timeMatch[3] ?? 0),
  };
  if (
    desired.month < 1 ||
    desired.month > 12 ||
    desired.day < 1 ||
    desired.day > 31 ||
    desired.hour > 23 ||
    desired.minute > 59 ||
    desired.second > 59
  ) {
    throw new BadRequestException("Date ou heure d'audience invalide");
  }

  const desiredEpoch = Date.UTC(
    desired.year,
    desired.month - 1,
    desired.day,
    desired.hour,
    desired.minute,
    desired.second,
  );
  let candidate = desiredEpoch;
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const rendered = datePartsInZone(new Date(candidate), timezone);
    const renderedEpoch = Date.UTC(
      rendered.year,
      rendered.month - 1,
      rendered.day,
      rendered.hour,
      rendered.minute,
      rendered.second,
    );
    candidate += desiredEpoch - renderedEpoch;
  }

  const result = new Date(candidate);
  const check = datePartsInZone(result, timezone);
  if (
    check.year !== desired.year ||
    check.month !== desired.month ||
    check.day !== desired.day ||
    check.hour !== desired.hour ||
    check.minute !== desired.minute
  ) {
    throw new BadRequestException(
      "L'heure locale indiquée n'existe pas dans ce fuseau horaire",
    );
  }
  return result;
}

export function audienceLegacyParts(
  startsAtUtc: Date,
  timezone: string,
): { legacyDate: string; legacyTime: string } {
  assertIanaTimezone(timezone);
  const parts = datePartsInZone(startsAtUtc, timezone);
  const pad = (value: number) => String(value).padStart(2, '0');
  return {
    legacyDate: `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`,
    legacyTime: `${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}`,
  };
}

export function normalizeAudienceSchedule(
  input: AudienceScheduleInput,
): NormalizedAudienceSchedule {
  const timezone = input.timezone?.trim() || DEFAULT_AUDIENCE_TIMEZONE;
  assertIanaTimezone(timezone);

  let startsAtUtc: Date;
  if (input.starts_at_utc) {
    const raw = String(input.starts_at_utc);
    if (
      typeof input.starts_at_utc === 'string' &&
      !/(?:Z|[+-]\d{2}:\d{2})$/i.test(raw)
    ) {
      throw new BadRequestException(
        'starts_at_utc doit contenir un décalage explicite ou le suffixe Z',
      );
    }
    startsAtUtc = new Date(input.starts_at_utc);
  } else {
    if (!input.audience_date || !input.audience_time) {
      throw new BadRequestException(
        'starts_at_utc est requis (date/heure historiques acceptées temporairement)',
      );
    }
    const datePart =
      input.audience_date instanceof Date
        ? input.audience_date.toISOString().slice(0, 10)
        : String(input.audience_date).slice(0, 10);
    startsAtUtc = zonedLocalDateTimeToUtc(
      datePart,
      input.audience_time,
      timezone,
    );
  }
  if (Number.isNaN(startsAtUtc.getTime())) {
    throw new BadRequestException("Date de début d'audience invalide");
  }
  const { legacyDate, legacyTime } = audienceLegacyParts(
    startsAtUtc,
    timezone,
  );
  return { startsAtUtc, timezone, legacyDate, legacyTime };
}
