import { Injectable } from '@nestjs/common';
import { Repository, ObjectLiteral, Brackets } from 'typeorm';

interface JoinConfig {
  relation: string;
  alias: string;
  conditions?: { [key: string]: any };
  likeFields?: string[];
}
interface OrConditionGroup {
  andConditions: Array<{
    field: string;
    value: any;
    operator?: '=' | '!=' | '>' | '<' | 'LIKE'; // Optionnel
  }>;
}
interface SearchOptions {
  alias: string;
  conditions?: { [key: string]: any };
  orConditions?: OrConditionGroup[]; // Ajouté ici
  likeFields?: string[];
  joins?: JoinConfig[];
  skip?: number;
  take?: number;
  orderBy?: {
    field: string;
    direction?: 'ASC' | 'DESC';
    alias?: string; // pour trier sur une table jointe
  };
}

export interface AdvancedSearchOptions {
  alias: string;
  searchFields: string[];
  searchTerm: string;
  exactMatch?: boolean;
  skip?: number;
  take?: number;
  orderBy?: {
    field: string;
    direction?: 'ASC' | 'DESC';
  };
}
@Injectable()
export abstract class BaseService<T extends ObjectLiteral> {
  abstract getRepository(): Repository<T>;

  /**
   * Recherche avec LIKE sur chaque champ.
   */
     /**
   * Recherche exacte avec égalité stricte.
   */
async searchDynamic(
  query: Partial<Record<keyof T, any>>,
  mode: 'like' | 'exact' = 'like',
): Promise<T[]> {
  const qb = this.getRepository().createQueryBuilder('entity');

  Object.keys(query).forEach((key) => {
    const value = query[key];
    if (value !== undefined && value !== null && value !== '') {
      if (mode === 'like') {
        qb.andWhere(`entity.${key} LIKE :${key}`, { [key]: `%${value}%` });
      } else {
        qb.andWhere(`entity.${key} = :${key}`, { [key]: value });
      }
    }
  });

  return qb.getMany();
}


async enhancedSearch({
  alias,
  searchFields,
  searchTerm,
  exactMatch = false,
  skip,
  take,
  orderBy,
}: AdvancedSearchOptions): Promise<T[]> {
  const qb = this.getRepository().createQueryBuilder(alias);
  const joinedRelations = new Set<string>();

  // Traitement automatique des jointures
  searchFields.forEach(field => {
    const parts = field.split('.');
    if (parts.length > 1) {
      const relationPath = parts.slice(0, -1).join('.');
      if (!joinedRelations.has(relationPath)) {
        qb.leftJoinAndSelect(`${alias}.${relationPath}`, relationPath);
        joinedRelations.add(relationPath);
      }
    }
  });

  // Construction des conditions de recherche
  qb.andWhere(
    new Brackets((where) => {
      searchFields.forEach(field => {
        const paramName = field.replace(/\./g, '_');
        const condition = exactMatch 
          ? `${field} = :${paramName}` 
          : `${field} ILIKE :${paramName}`;
        
        where.orWhere(condition, { 
          [paramName]: exactMatch ? searchTerm : `%${searchTerm}%`
        });
      });
    })
  );

  // Pagination
  if (typeof skip === 'number') qb.skip(skip);
  if (typeof take === 'number') qb.take(take);

  // Tri
  if (orderBy) {
    qb.orderBy(orderBy.field, orderBy.direction || 'ASC');
  }

  return qb.getMany();
}


async searchWithJoinsAdvanced_V_0({
  alias,
  conditions = {},
  likeFields = [],
  joins = [],
  skip,
  take,
  orderBy,
}: SearchOptions): Promise<T[]> {
  let qb = this.getRepository().createQueryBuilder(alias);

  // Joins
  for (const join of joins) {
    qb = qb.leftJoinAndSelect(`${alias}.${join.relation}`, join.alias);

    if (join.conditions) {
      for (const [field, value] of Object.entries(join.conditions)) {
        const param = `${join.alias}_${field}`;
        qb = qb.andWhere(`${join.alias}.${field} = :${param}`, { [param]: value });
      }
    }

    if (join.likeFields) {
      for (const field of join.likeFields) {
        const param = `${join.alias}_${field}_like`;
        qb = qb.andWhere(`${join.alias}.${field} LIKE :${param}`, {
          [param]: `%${conditions[field] ?? ''}%`,
        });
      }
    }
  }

  // Conditions exactes
  for (const [field, value] of Object.entries(conditions)) {
    if (!likeFields.includes(field)) {
      const param = `${alias}_${field}`;
      qb = qb.andWhere(`${alias}.${field} = :${param}`, { [param]: value });
    }
  }

  // Conditions LIKE
  for (const field of likeFields) {
    const param = `${alias}_${field}_like`;
    qb = qb.andWhere(`${alias}.${field} LIKE :${param}`, {
      [param]: `%${conditions[field] ?? ''}%`,
    });
  }

  // Pagination
  if (skip !== undefined) qb = qb.skip(skip);
  if (take !== undefined) qb = qb.take(take);

  // Tri
  if (orderBy) {
    const sortAlias = orderBy.alias ?? alias;
    qb = qb.orderBy(`${sortAlias}.${orderBy.field}`, orderBy.direction ?? 'ASC');
  }

  return qb.getMany();
}

async searchWithJoinsAdvanced({
  alias,
  conditions = {},
  orConditions = [],
  likeFields = [],
  joins = [],
  skip,
  take,
  orderBy,
}: SearchOptions): Promise<T[]> {
  let qb = this.getRepository().createQueryBuilder(alias);

  // Joins
  for (const join of joins) {
    qb = qb.leftJoinAndSelect(`${alias}.${join.relation}`, join.alias);

    if (join.conditions) {
      for (const [field, value] of Object.entries(join.conditions)) {
        const param = `${join.alias}_${field}`;
        qb = qb.andWhere(`${join.alias}.${field} = :${param}`, { [param]: value });
      }
    }

    if (join.likeFields) {
      for (const field of join.likeFields) {
        const param = `${join.alias}_${field}_like`;
        qb = qb.andWhere(`${join.alias}.${field} LIKE :${param}`, {
          [param]: `%${conditions[field] ?? ''}%`,
        });
      }
    }
  }

  // Conditions exactes
  for (const [field, value] of Object.entries(conditions)) {
    if (!likeFields.includes(field)) {
      const param = `${alias}_${field}`;
      qb = qb.andWhere(`${alias}.${field} = :${param}`, { [param]: value });
    }
  }

  // Conditions LIKE
  for (const field of likeFields) {
    const param = `${alias}_${field}_like`;
    qb = qb.andWhere(`${alias}.${field} LIKE :${param}`, {
      [param]: `%${conditions[field] ?? ''}%`,
    });
  }

  // Conditions OR avec Brackets
  if (orConditions.length > 0) {
    qb = qb.andWhere(
      new Brackets((mainQb) => {
        orConditions.forEach((orGroup, index) => {
          mainQb.orWhere(
            new Brackets((orQb) => {
              orGroup.andConditions.forEach((andCond) => {
                const param = `${alias}_or_${index}_${andCond.field}`;
                const operator = andCond.operator || '=';
                orQb.andWhere(
                  `${alias}.${andCond.field} ${operator} :${param}`,
                  { [param]: andCond.value }
                );
              });
            })
          );
        });
      })
    );
  }

  // Pagination
  if (skip !== undefined) qb = qb.skip(skip);
  if (take !== undefined) qb = qb.take(take);

  // Tri
  if (orderBy) {
    const sortAlias = orderBy.alias ?? alias;
    qb = qb.orderBy(`${sortAlias}.${orderBy.field}`, orderBy.direction ?? 'ASC');
  }

  return qb.getMany();
}



}





