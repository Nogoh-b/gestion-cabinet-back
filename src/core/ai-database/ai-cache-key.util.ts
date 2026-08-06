function stableNormalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableNormalize);
  }

  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        const next = (value as Record<string, unknown>)[key];
        if (next !== undefined) {
          acc[key] = stableNormalize(next);
        }
        return acc;
      }, {});
  }

  if (typeof value === 'string') {
    return value.trim().replace(/\s+/g, ' ').toLowerCase();
  }

  return value ?? null;
}

export function buildAiCacheKey(scope: string, parts: Record<string, unknown>): string {
  return `${scope}:${JSON.stringify(stableNormalize(parts))}`;
}
