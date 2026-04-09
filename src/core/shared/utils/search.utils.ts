// src/common/utils/search.utils.ts
import { FindOptionsWhere, Like, Between, In, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { ObjectLiteral } from 'typeorm';

export interface SearchFilter {
  field: string;
  value: any;
  operator?: 'equals' | 'like' | 'in' | 'between' | 'gte' | 'lte';
}

export class SearchUtils {
  static buildWhereConditions<T extends ObjectLiteral>(
    filters: SearchFilter[]
  ): FindOptionsWhere<T> {
    const where: Record<string, any> = {};

    filters.forEach(filter => {
      switch (filter.operator) {
        case 'like':
          where[filter.field] = Like(`%${filter.value}%`);
          break;
        case 'in':
          where[filter.field] = In(filter.value);
          break;
        case 'between':
          if (Array.isArray(filter.value) && filter.value.length === 2) {
            where[filter.field] = Between(filter.value[0], filter.value[1]);
          }
          break;
        case 'gte':
          where[filter.field] = MoreThanOrEqual(filter.value);
          break;
        case 'lte':
          where[filter.field] = LessThanOrEqual(filter.value);
          break;
        default:
          where[filter.field] = filter.value;
      }
    });

    return where as FindOptionsWhere<T>;
  }

  static buildSearchConditions<T extends ObjectLiteral>(
    searchTerm: string,
    searchableFields: string[]
  ): FindOptionsWhere<T>[] {
    if (!searchTerm || searchableFields.length === 0) {
      return [];
    }

    return searchableFields.map(field => ({
      [field]: Like(`%${searchTerm}%`)
    })) as FindOptionsWhere<T>[];
  }
}