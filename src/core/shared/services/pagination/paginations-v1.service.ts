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
    
    // Construire l'ordre en prenant en compte les relations
    const order = this.buildOrderFromParams(paginationParams, additionalOptions.order);

    const [data, total] = await repository.findAndCount({
      where,
      relations,
      order,
      skip: (page - 1) * limit,
      take: limit,
      ...additionalOptions
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
    const finalRelations = this.ensureRelationsForSorting(relations, paginationParams.sort_by);

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