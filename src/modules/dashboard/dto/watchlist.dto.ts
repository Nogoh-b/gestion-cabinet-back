// src/modules/dashboard/dto/watchlist.dto.ts

/** Types de listes ouvertes par les chips « À surveiller » du tableau de bord. */
export const WATCHLIST_TYPES = [
  'dossiers-urgents',
  'actions-en-retard',
  'factures-impayees',
  'documents-en-attente',
  'audiences-a-venir',
] as const;

export type WatchlistType = (typeof WATCHLIST_TYPES)[number];

export function isWatchlistType(value: string): value is WatchlistType {
  return (WATCHLIST_TYPES as readonly string[]).includes(value);
}

/** Ligne normalisée, quel que soit le type d'élément surveillé. */
export class WatchlistItemDto {
  id: number | string;
  title: string;
  subtitle: string;
  /** Date de référence : échéance, date d'audience, dépôt, ouverture. */
  date: Date | string | null;
  /** Ton = nom d'un `BadgeTone` du front (error, warning, info…). */
  badge: { label: string; tone: string } | null;
  /** Chemin de détail, sans préfixe tenant. */
  href: string;
}

export class WatchlistPageDto {
  type: WatchlistType;
  items: WatchlistItemDto[];
  total: number;
  page: number;
  limit: number;
}
