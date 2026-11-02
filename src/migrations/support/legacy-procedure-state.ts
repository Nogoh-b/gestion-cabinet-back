export type JsonObject = Record<string, unknown>;

export function parseLegacyJson(value: unknown): unknown {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function legacyStringList(value: unknown): string[] {
  const parsed = parseLegacyJson(value);
  if (!Array.isArray(parsed)) return [];
  return [
    ...new Set(
      parsed.filter(
        (item): item is string =>
          typeof item === 'string' && item.trim().length > 0,
      ),
    ),
  ];
}

export function legacyObject(value: unknown): JsonObject {
  const parsed = parseLegacyJson(value);
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? (parsed as JsonObject)
    : {};
}

export function selectUnambiguousVisit(
  visits: Array<{ id: string }>,
  completedVisitIds: string[],
): string | null {
  const completed = [...new Set(completedVisitIds)];
  if (completed.length === 1) return completed[0];
  if (completed.length > 1) return null;
  return visits.length === 1 ? visits[0].id : null;
}
