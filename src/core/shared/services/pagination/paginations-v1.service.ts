// src/common/pagination/paginations.service.ts
import { plainToInstance } from 'class-transformer';
import { Repository, FindOptionsWhere, ObjectLiteral, FindManyOptions } from 'typeorm';
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
    const limit = Number(paginationParams.limit )?? 10;
    console.log('Pagination params11:', page ,'*', limit);
    const [data, total] = await repository.findAndCount({
      where,
      relations,
      order: additionalOptions.order,
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
   * ✅ Version corrigée : applique automatiquement le DTO si fourni
   */
  async paginateWithTransformer<T extends ObjectLiteral, R>(
    repository: Repository<T>,
    paginationParams: PaginationParamsDto,
    transformer: (data: T[]) => Promise<R[]> | R[],
    where?: FindOptionsWhere<T> | FindOptionsWhere<T>[],
    relations: string[] = [],
    additionalOptions: FindManyOptions<T> = {},
    dtoClass?: new (...args: any[]) => R, // <-- DTO optionnel
  ): Promise<PaginatedResult<R>> {
    const result = await this.paginate(
      repository,
      paginationParams,
      where,
      relations,
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
}
