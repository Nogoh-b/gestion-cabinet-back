import { BadRequestException, Injectable } from '@nestjs/common';
import { Repository, ObjectLiteral, Brackets, EntityMetadata, SelectQueryBuilder } from 'typeorm';
import { validateDto } from '../../pipes/validate-dto';
import { AdvancedSearchOptionsDto } from '../../dto/advanced-search.dto';

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




// Nouvelle version améliorée dans BaseService
async enhancedSearch_1({
  alias,
  searchFields,
  searchTerm,
  exactMatch = false,
  skip,
  take,
  orderBy,
}: AdvancedSearchOptions): Promise<T[]> {
  validateDto(AdvancedSearchOptionsDto, {
  alias,
  searchFields,
  searchTerm,
  exactMatch,
  skip,
  take,
  orderBy,
})

  const qb = this.getRepository().createQueryBuilder(alias);
  const joinedRelations = new Set<string>();
  const metadata = this.getRepository().metadata;

  // Traitement automatique des jointures pour les champs de recherche
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
          : `${field} LIKE :${paramName}`;
        
        where.orWhere(condition, { 
          [paramName]: exactMatch ? searchTerm : `%${searchTerm}%`
        });
      });
    })
  );

  // Pagination
  if (typeof skip === 'number') qb.skip(skip);
  if (typeof take === 'number') qb.take(take);






  // Traitement supplémentaire pour le tri
  if (orderBy) {
    const [relationPath, field] = this.splitOrderField_1(orderBy.field, alias);
    
    if (relationPath !== alias && !joinedRelations.has(relationPath)) {
      qb.leftJoinAndSelect(`${alias}.${relationPath}`, relationPath);
      joinedRelations.add(relationPath);
    }

    const dbColumn = this.getDatabaseColumnName_1(metadata, relationPath, field, alias);
    qb.orderBy(`${relationPath}.${dbColumn}`, orderBy.direction || 'ASC');
  }

  // Reste de la logique de recherche...
  return qb.getMany();
}



private joinRecursive(qb: SelectQueryBuilder<any>, alias: string, fieldPath: string, joined: Set<string>) {
  const parts = fieldPath.split('.');
  let currentAlias = alias;

  for (let i = 0; i < parts.length - 1; i++) {
    const relation = parts.slice(0, i + 1).join('.');
    const nextAlias = parts[i];

    if (!joined.has(relation)) {
      qb.leftJoinAndSelect(`${currentAlias}.${parts[i]}`, nextAlias);
      joined.add(relation);
    }

    currentAlias = nextAlias;
  }
}





// Méthodes utilitaires
private splitOrderField_1(field: string, mainAlias: string): [string, string] {
  const parts = field.split('.');
  return parts.length > 1 
    ? [parts.slice(0, -1).join('.'), parts[parts.length - 1]] 
    : [mainAlias, field];
}

private getDatabaseColumnName_1(
  metadata: EntityMetadata, 
  relationPath: string, 
  field: string,
  alias: string
): string {
  try {
    // Cas du champ principal
    if (relationPath === alias) {
      const column = metadata.columns.find(
        c => c.propertyName === field
      );
      
      if (!column) {
        throw new Error('Column not found');
      }
      
      return column.databaseName;
    }

    // Cas des relations
    const relation = metadata.findRelationWithPropertyPath(relationPath);
    const targetMetadata = relation!.inverseEntityMetadata;
    
    const column = targetMetadata.columns.find(
      c => c.propertyName === field
    );

    if (!column) {
      throw new Error('Column not found');
    }

    return column.databaseName;
  } catch (e) {
    throw new BadRequestException(`Invalid sort field: ${relationPath}.${field}`);
  }
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
    const repo = this.getRepository();
    const qb = repo.createQueryBuilder(alias);
    const metadata = repo.metadata as EntityMetadata;
    const joined = new Set<string>();
    const aliasMap = new Map<string, string>();

    // Recursive join for nested relations
    const joinRecursive = (path: string) => {
      const parts = path.split('.');
      let parentAlias = alias;
      let accumulated = '';

      for (let i = 0; i < parts.length - 1; i++) {
        accumulated = accumulated ? `${accumulated}.${parts[i]}` : parts[i];

        if (joined.has(accumulated)) {
          parentAlias = aliasMap.get(accumulated)!;
          continue;
        }

        // Ensure relation exists in metadata
        const relation = metadata.relations.find(r => r.propertyName === parts[i]);
        if (!relation) {
          throw new BadRequestException(`Invalid relation: ${accumulated}`);
        }

        const joinAlias = parts[i];
        qb.leftJoinAndSelect(`${parentAlias}.${parts[i]}`, joinAlias);
        joined.add(accumulated);
        aliasMap.set(accumulated, joinAlias);
        parentAlias = joinAlias;
      }
    };

    // Apply joins based on searchFields
    searchFields.forEach(field => joinRecursive(field));

    // Build WHERE clause
    const termValue = exactMatch ? searchTerm : `%${searchTerm}%`;
    qb.andWhere(new Brackets(br => {
      searchFields.forEach((field, idx) => {
        const parts = field.split('.');
        const column = parts.pop()!;
        const relPath = parts.join('.');
        const targetAlias = relPath ? aliasMap.get(relPath)! : alias;

        const operator = exactMatch ? '=' : 'LIKE';
        const condition = `${targetAlias}.${column} ${operator} :term`;

        idx === 0 ? br.where(condition, { term: termValue }) : br.orWhere(condition, { term: termValue });
      });
    }));

    // Pagination
    if (skip !== undefined) qb.skip(skip);
    if (take !== undefined) qb.take(take);

    // Ordering
    if (orderBy) {
      const parts = orderBy.field.split('.');
      const column = parts.pop()!;
      const relPath = parts.join('.');
      if (relPath && !joined.has(relPath)) {
        joinRecursive(`${relPath}.${column}`);
      }
      const orderAlias = relPath ? aliasMap.get(relPath)! : alias;

      // Resolve column to database name
      const relationMeta = relPath
        ? metadata.findRelationWithPropertyPath(relPath)
        : null;
      let dbName: string;
      if (!relationMeta) {
        const colMeta = metadata.columns.find(c => c.propertyName === column);
        if (!colMeta) throw new BadRequestException(`Invalid sort field: ${orderBy.field}`);
        dbName = colMeta.databaseName;
      } else {
        const targetMeta = relationMeta.inverseEntityMetadata;
        const colMeta = targetMeta.columns.find(c => c.propertyName === column);
        if (!colMeta) throw new BadRequestException(`Invalid sort field: ${orderBy.field}`);
        dbName = colMeta.databaseName;
      }

      qb.orderBy(`${orderAlias}.${dbName}`, orderBy.direction || 'ASC');
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





