export interface PaginationOptions {
  page?: number;
  limit?: number;
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: PaginationMeta;
}


export interface SearchOptions {
  /** Terme à rechercher */
  term: string;
  /** Liste de champs sur lesquels chercher (exemple: ['name','email']). Si omis, recherche sur toutes les colonnes texte. */
  fields?: string[];
  /** Mode exact (=) ou partiel (LIKE) */
  exact?: boolean;
}

/**
 * Intervalle de dates pour filtrer selon createdAt
 */
export interface DateRange {
  /** Date de début (inclusive) */
  from?: Date;
  /** Date de fin (inclusive) */
  to?: Date;
}