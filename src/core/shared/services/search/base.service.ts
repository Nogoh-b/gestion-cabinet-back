import { Repository, ObjectLiteral, Brackets, EntityMetadata, SelectQueryBuilder } from 'typeorm';
import { ColumnMetadata } from 'typeorm/metadata/ColumnMetadata';
import { RelationMetadata } from 'typeorm/metadata/RelationMetadata';
import { BadRequestException, Injectable } from '@nestjs/common';













import { AdvancedSearchOptionsDto } from '../../dto/advanced-search.dto';
import { validateDto } from '../../pipes/validate-dto';














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
  searchFields?: string[]; // ⬅️ rendre ce champ optionnel
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
   * Recherche un terme dans toutes les entités sous-jacentes à l’entité T :
   * - Les colonnes texte (varchar, text, char, etc.) de l’entité racine
   * - Toutes les colonnes texte des entités liées (ManyToOne, OneToOne, etc.), récursivement
   *
   * @param term Chaîne à rechercher (insensible à la casse)
   */
 async searchAllEntities(term: string): Promise<any> {
    const repo = this.getRepository();
    const metadata = repo.metadata;
    const rootAlias = metadata.tableName;
    const qb: SelectQueryBuilder<T> = repo.createQueryBuilder(rootAlias);
    // 1. Construire la liste des chemins de relations
    const relationPaths = this.collectRelationPaths(metadata);

    // 2. Ajouter les LEFT JOIN … pour chaque relation
    relationPaths.forEach((path) => {
      const relationAlias = path.replace(/\./g, '_');
      qb.leftJoinAndSelect(`${rootAlias}.${path}`, relationAlias);
    });

    // 3. Préparer les conditions WHERE pour tous les champs texte
    const lowerTerm = `%${term.toLowerCase()}%`;
    const whereClauses: string[] = [];

    // 3.1. Colonnes texte de l’entité racine
    metadata.columns.forEach((col) => {
      if (this.isTextColumn(col)) {
        whereClauses.push(`LOWER(${rootAlias}.${col.propertyName}) LIKE :term`);
      }
    });

    // 3.2. Colonnes texte des entités liées
    relationPaths.forEach((path) => {
      const relationAlias = path.replace(/\./g, '_');
      const relMeta = this.getRelationMetadataByPath(metadata, path);
      if (!relMeta) return;

      const targetMeta = relMeta.inverseEntityMetadata;
      targetMeta.columns.forEach((col) => {
        if (this.isTextColumn(col)) {
          whereClauses.push(`LOWER(${relationAlias}.${col.propertyName}) LIKE :term`);
        }
      });
    });

    // 4. Appliquer les conditions WHERE/OR WHERE de façon sûre
    if (whereClauses.length > 0) {
      // On récupère le premier élément sans risquer undefined
      const [firstClause, ...otherClauses] = whereClauses;
      qb.where(firstClause, { term: lowerTerm });
      otherClauses.forEach((clause) => {
        qb.orWhere(clause, { term: lowerTerm });
      });
    }

    // 5. Exécuter
    return qb.getMany();
  }


  /**
   * Détermine si une colonne est de type texte (varchar, text, char, etc.).
   * On peut ajuster cette liste selon les types utilisés dans vos entités.
   */
  private isTextColumn(col: ColumnMetadata): boolean {
    // column.type peut être une fonction, un string ou un Object (selon la config TypeORM).
    const type = col.type;
    // On convertit en string pour faciliter la comparaison
    const typeStr = typeof type === 'string' ? type.toLowerCase() : '';

    return (
      typeStr.includes('char') ||
      typeStr.includes('text') ||
      typeStr === 'varchar' ||
      typeStr === 'nvarchar' ||
      typeStr === 'uuid'
    );
  }

  /**
   * Récupère les métadonnées de la relation correspondant à un chemin (path) donné.
   * Par exemple, si path = "district.division.region", on boucle récursivement.
   */
  private getRelationMetadataByPath(
    rootMeta: EntityMetadata,
    path: string,
  ): RelationMetadata | null {
    const segments = path.split('.'); // e.g. ['district','division','region']
    let currentMeta: EntityMetadata | undefined = rootMeta;
    let relMeta: RelationMetadata | undefined;

    for (const segment of segments) {
      relMeta = currentMeta.relations.find(
        (r) => r.propertyName === segment,
      );
      if (!relMeta) {
        return null;
      }
      currentMeta = relMeta.inverseEntityMetadata;
    }
    return relMeta || null;
  }

  /**
   * Construit récursivement la liste de tous les chemins de relations à partir d’un metadata d’entité.
   * Limite la profondeur pour éviter les boucles infinies (self-relation).
   *
   * Par défaut, on descend jusqu’à 3 niveaux de profondeur (configurable).
   */
  private collectRelationPaths(
    meta: EntityMetadata,
    prefix = '',
    depth = 0,
    maxDepth = 5,
  ): string[] {
    if (depth >= maxDepth) return [];

    const paths: string[] = [];

    meta.relations.forEach((rel) => {
      const prop = rel.propertyName; // e.g. "district"
      const newPath = prefix ? `${prefix}.${prop}` : prop; // e.g. "district" ou "district.division"

      paths.push(newPath);
      // Descendre dans la relation pour récupérer d’autres sous-relations
      const subPaths = this.collectRelationPaths(
        rel.inverseEntityMetadata,
        newPath,
        depth + 1,
        maxDepth,
      );
      subPaths.forEach((sp) => paths.push(sp));
    });

    return paths;
  }




























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
  searchFields!.forEach(field => {
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
      searchFields!.forEach(field => {
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





async enhancedSearchv0({
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

  // Fonction récursive pour récupérer tous les champs scalaires accessibles
  const extractSearchableFields = (
    meta: EntityMetadata,
    prefix = '',
    depth = 5
  ): string[] => {
    if (depth <= 0) return [];

    const fields: string[] = [];

    for (const col of meta.columns) {
      if (!col.relationMetadata) {
        fields.push(prefix ? `${prefix}.${col.propertyName}` : col.propertyName);
      }
    }

    for (const rel of meta.relations) {
      const nestedPrefix = prefix ? `${prefix}.${rel.propertyName}` : rel.propertyName;
      const nestedMeta = rel.inverseEntityMetadata;
      const nestedFields = extractSearchableFields(nestedMeta, nestedPrefix, depth - 1);
      fields.push(...nestedFields);
    }

    return fields;
  };

  // Générer dynamiquement les searchFields si non fournis
  if (!searchFields || searchFields.length === 0) {
    searchFields = extractSearchableFields(metadata, '', 6); // Profondeur max = 5
  }

  // Jointures automatiques
  const joinRecursive = (path: string) => {
    const parts = path.split('.');
    let parentAlias = alias;
    let accumulated = '';
    let currentMeta = metadata;

    for (let i = 0; i < parts.length - 1; i++) {
      accumulated = accumulated ? `${accumulated}.${parts[i]}` : parts[i];

      if (joined.has(accumulated)) {
        parentAlias = aliasMap.get(accumulated)!;
        currentMeta = currentMeta.relations.find(r => r.propertyName === parts[i])!.inverseEntityMetadata;
        continue;
      }

      const relation = currentMeta.relations.find(r => r.propertyName === parts[i]);
      if (!relation) {
        throw new BadRequestException(`Invalid relation: ${accumulated}`);
      }

      const joinAlias = accumulated.replace(/\./g, '_');
      qb.leftJoinAndSelect(`${parentAlias}.${parts[i]}`, joinAlias);
      joined.add(accumulated);
      aliasMap.set(accumulated, joinAlias);

      parentAlias = joinAlias;
      currentMeta = relation.inverseEntityMetadata;
    }
  };


  // Appliquer les jointures
  searchFields.forEach(field => joinRecursive(field));

  // Construction du WHERE
  const termValue = exactMatch ? searchTerm : `%${searchTerm}%`;
  qb.andWhere(new Brackets(br => {
    searchFields.forEach((field, idx) => {
      const parts = field.split('.');
      const column = parts.pop()!;
      const relPath = parts.join('.');
      const targetAlias = relPath ? aliasMap.get(relPath)! : alias;

      const operator = exactMatch ? '=' : 'LIKE';
      const condition = `${targetAlias}.${column} ${operator} :term`;

      idx === 0
        ? br.where(condition, { term: termValue })
        : br.orWhere(condition, { term: termValue });
    });
  }));

  // Pagination
  if (skip !== undefined) qb.skip(skip);
  if (take !== undefined) qb.take(take);

  // Tri
  if (orderBy) {
    const parts = orderBy.field.split('.');
    const column = parts.pop()!;
    const relPath = parts.join('.');
    if (relPath && !joined.has(relPath)) {
      joinRecursive(`${relPath}.${column}`);
    }
    const orderAlias = relPath ? aliasMap.get(relPath)! : alias;

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

  // Fonction récursive pour extraire tous les champs scalaires (y compris dans les relations)
  const extractSearchableFields = (
    meta: EntityMetadata,
    prefix = '',
    depth = 3
  ): string[] => {
    if (depth <= 0) return [];

    const fields: string[] = [];

    for (const col of meta.columns) {
      if (!col.relationMetadata) {
        fields.push(prefix ? `${prefix}.${col.propertyName}` : col.propertyName);
      }
    }

    for (const rel of meta.relations) {
      const nestedPrefix = prefix ? `${prefix}.${rel.propertyName}` : rel.propertyName;
      const nestedMeta = rel.inverseEntityMetadata;
      const nestedFields = extractSearchableFields(nestedMeta, nestedPrefix, depth - 1);
      fields.push(...nestedFields);
    }

    return fields;
  };

  // Remplir automatiquement les champs à chercher si non fournis
  if (!searchFields || searchFields.length === 0) {
    searchFields = extractSearchableFields(metadata, '', 3); // Profondeur personnalisable
  }

  // Fonction pour faire les jointures récursives
  const joinRecursive = (path: string) => {
    const parts = path.split('.');
    let parentAlias = alias;
    let accumulated = '';
    let currentMeta = metadata;

    for (let i = 0; i < parts.length - 1; i++) {
      accumulated = accumulated ? `${accumulated}.${parts[i]}` : parts[i];

      if (joined.has(accumulated)) {
        parentAlias = aliasMap.get(accumulated)!;
        currentMeta = currentMeta.relations.find(r => r.propertyName === parts[i])!.inverseEntityMetadata;
        continue;
      }

      const relation = currentMeta.relations.find(r => r.propertyName === parts[i]);
      if (!relation) {
        throw new BadRequestException(`Invalid relation: ${accumulated}`);
      }

      const joinAlias = `${accumulated.replace(/\./g, '_')}_rel`;
      qb.leftJoinAndSelect(`${parentAlias}.${parts[i]}`, joinAlias);
      joined.add(accumulated);
      aliasMap.set(accumulated, joinAlias);

      parentAlias = joinAlias;
      currentMeta = relation.inverseEntityMetadata;
    }
  };

  // Appliquer les jointures nécessaires
  searchFields.forEach(field => joinRecursive(field));

  // Construction du WHERE
  const termValue = exactMatch ? searchTerm : `%${searchTerm}%`;
  qb.andWhere(new Brackets(br => {
    searchFields.forEach((field, idx) => {
      const parts = field.split('.');
      const column = parts.pop()!;
      const relPath = parts.join('.');
      const targetAlias = relPath ? aliasMap.get(relPath)! : alias;

      const operator = exactMatch ? '=' : 'LIKE';
      const condition = `${targetAlias}.${column} ${operator} :term`;

      idx === 0
        ? br.where(condition, { term: termValue })
        : br.orWhere(condition, { term: termValue });
    });
  }));

  // Pagination
  if (skip !== undefined) qb.skip(skip);
  if (take !== undefined) qb.take(take);

 /* // Tri sécurisé
  if (orderBy) {
    const parts = orderBy.field.split('.');
    const column = parts.pop()!;
    const relPath = parts.join('.');

    try {
      // Join au besoin
      if (relPath && !joined.has(relPath)) {
        joinRecursive(`${relPath}.${column}`);
      }

      const orderAlias = relPath ? aliasMap.get(relPath) : alias;
      if (!orderAlias) {
        throw new BadRequestException(`Invalid alias for order field: ${orderBy.field}`);
      }

      // Résolution de l'entité cible
      let currentMeta = metadata;
      for (const part of parts) {
        const relation = currentMeta.relations.find(r => r.propertyName === part);
        if (!relation) {
          throw new BadRequestException(`Invalid relation "${part}" in orderBy: ${orderBy.field}`);
        }
        currentMeta = relation.inverseEntityMetadata;
      }

      const colMeta = currentMeta.columns.find(c => c.propertyName === column);
      if (!colMeta) {
        console.error('🛑 Colonne non trouvée pour tri :', column);
        console.error('📋 Colonnes disponibles :', currentMeta.columns.map(c => c.propertyName));
        throw new BadRequestException(`Invalid sort column "${column}" in: ${orderBy.field}`);
      }

      const dbName = colMeta.databaseName;
      qb.orderBy(`${orderAlias}.${dbName}`, orderBy.direction || 'ASC');
    } catch (err) {
      console.error('💥 Erreur dans la clause ORDER BY:', err.message);
      throw err;
    }
  }*/


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





