import { Injectable } from '@nestjs/common';
import { Repository, ObjectLiteral } from 'typeorm';

interface JoinConfig {
  relation: string;
  alias: string;
  conditions?: { [key: string]: any };
  likeFields?: string[];
}

interface SearchOptions {
  alias: string;
  conditions?: { [key: string]: any };
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




async searchWithJoinsAdvanced({
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



}
