// src/common/pagination/paginations.service.ts
import { plainToInstance } from 'class-transformer';
import {
  Repository,
  FindOptionsWhere,
  ObjectLiteral,
  FindManyOptions,
  FindOptionsOrder
} from 'typeorm';
import { Injectable } from '@nestjs/common';

import { PaginationParamsDto } from '../../dto/pagination-params.dto';


export interface PaginatedResult<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
    has_previous: boolean;
    has_next: boolean;
  };
}

@Injectable()
export class PaginationServiceV1 {
  async paginate<T extends ObjectLiteral>(
    repository: Repository<T>,
    paginationParams: PaginationParamsDto,
    where?: FindOptionsWhere<T> | FindOptionsWhere<T>[],
    relations: string[] = [],
    additionalOptions: FindManyOptions<T> = {}
  ): Promise<PaginatedResult<T>> {
    const page = Number(paginationParams.page) ?? 1;
    const limit = Number(paginationParams.limit) ?? 10;
    
    console.log('Pagination params:', page, '*', limit);
    
    const validSortBy = this.getValidSortBy(repository, paginationParams.sort_by);
    const invalidSortRequested = !!paginationParams.sort_by && !validSortBy;
    const safePaginationParams = Object.assign(new PaginationParamsDto(), paginationParams, {
      sort_by: validSortBy,
      sort_direction: validSortBy ? paginationParams.sort_direction : undefined,
    });

    // Un ordre dérivé d'un sort_by invalide doit aussi être écarté.
    const order = this.buildOrderFromParams(
      safePaginationParams,
      invalidSortRequested ? undefined : additionalOptions.order,
    );
    const { order: _ignoredOrder, ...safeAdditionalOptions } = additionalOptions;

    const [data, total] = await repository.findAndCount({
      ...safeAdditionalOptions,
      where,
      relations,
      order,
      skip: (page - 1) * limit,
      take: limit,
    });

    const totalPages = Math.ceil(total / limit);
    const hasPrevious = page > 1;
    const hasNext = page < totalPages;

    return {
      data,
      meta: {
        page,
        limit,
        total,
        total_pages: totalPages,
        has_previous: hasPrevious,
        has_next: hasNext,
      },
    };
  }

  /** Retourne le chemin de tri uniquement s'il existe dans les métadonnées TypeORM. */
  private getValidSortBy<T extends ObjectLiteral>(
    repository: Repository<T>,
    sortBy?: string,
  ): string | undefined {
    if (!sortBy) return undefined;

    if (repository.metadata.columns.some(
      (column) => column.propertyName === sortBy || column.propertyPath === sortBy,
    )) {
      return sortBy;
    }

    const parts = sortBy.split('.');
    if (parts.length < 2) return undefined;

    let metadata = repository.metadata;
    for (let index = 0; index < parts.length - 1; index++) {
      const relation = metadata.relations.find(
        (candidate) => candidate.propertyName === parts[index],
      );
      if (!relation?.inverseEntityMetadata) return undefined;
      metadata = relation.inverseEntityMetadata;
    }

    const property = parts[parts.length - 1];
    return metadata.columns.some(
      (column) => column.propertyName === property || column.propertyPath === property,
    )
      ? sortBy
      : undefined;
  }

  /**
   * Construit l'ordre à partir des paramètres de pagination
   */
  private buildOrderFromParams<T>(
    paginationParams: PaginationParamsDto,
    defaultOrder?: FindOptionsOrder<T>
  ): FindOptionsOrder<T> {
    if (!paginationParams.sort_by) {
      return defaultOrder || ({ created_at: 'ASC' } as unknown as FindOptionsOrder<T>);
    }

    const sortBy = paginationParams.sort_by;
    const sortDirection = (paginationParams.sort_direction || 'ASC').toUpperCase();

    // Vérifier si le tri concerne une relation (contient un point)
    if (sortBy.includes('.')) {
      const parts = sortBy.split('.');
      
      // Reconstruire l'objet order de manière récursive
      // Ex: 'procedure_subtype.name' -> { procedure_subtype: { name: 'ASC' } }
      let orderObj: any = {};
      let current = orderObj;
      
      for (let i = 0; i < parts.length - 1; i++) {
        current[parts[i]] = {};
        current = current[parts[i]];
      }
      
      current[parts[parts.length - 1]] = sortDirection;
      
      return orderObj as FindOptionsOrder<T>;
    }

    // Tri simple sur un champ direct
    return {
      [sortBy]: sortDirection
    } as FindOptionsOrder<T>;
  }

  /**
   * ✅ Version corrigée : applique automatiquement le DTO si fourni
   */
  async paginateWithTransformer<T extends ObjectLiteral, R>(
    repository: Repository<T>,
    paginationParams: PaginationParamsDto,
    transformer: (data: T[]) => Promise<R[]> | R[],
    where?: FindOptionsWhere<T> | FindOptionsWhere<T>[],
    relations: string[] = [],
    additionalOptions: FindManyOptions<T> = {},
    dtoClass?: new (...args: any[]) => R,
  ): Promise<PaginatedResult<R>> {
    
    // S'assurer que les relations nécessaires sont incluses pour le tri
    const validSortBy = this.getValidSortBy(repository, paginationParams.sort_by);
    const finalRelations = this.ensureRelationsForSorting(relations, validSortBy);

    const result = await this.paginate(
      repository,
      paginationParams,
      where,
      finalRelations,
      additionalOptions,
    );

    let transformedData = await transformer(result.data);

    // ✅ Si un DTO est passé, appliquer class-transformer proprement
    if (dtoClass) {
      transformedData = plainToInstance(dtoClass, transformedData, {
        excludeExtraneousValues: false,
      });
    }

    return {
      data: transformedData,
      meta: result.meta,
    };
  }

  /**
   * S'assure que les relations nécessaires pour le tri sont incluses
   */
  private ensureRelationsForSorting(
    existingRelations: string[], 
    sortBy?: string
  ): string[] {
    if (!sortBy || !sortBy.includes('.')) {
      return existingRelations;
    }

    const relations = [...existingRelations];
    const relationPath = sortBy.split('.')[0]; // Prendre seulement la première partie
    
    if (!relations.includes(relationPath)) {
      relations.push(relationPath);
    }

    return relations;
  }
}
