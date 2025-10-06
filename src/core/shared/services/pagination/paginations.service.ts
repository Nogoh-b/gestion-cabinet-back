// src/common/pagination/paginations.service.ts
import { Injectable } from '@nestjs/common';
import { Repository, FindOptionsWhere, ObjectLiteral, FindManyOptions } from 'typeorm';
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
export class PaginationService {
  async paginate<T extends ObjectLiteral>(
    repository: Repository<T>,
    paginationParams: PaginationParamsDto,
    where?: FindOptionsWhere<T> | FindOptionsWhere<T>[],
    relations: string[] = [],
    additionalOptions: FindManyOptions<T> = {}
  ): Promise<PaginatedResult<T>> {
    const page = paginationParams.page ?? 1;
    const limit = paginationParams.limit ?? 10;

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

  async paginateWithTransformer<T extends ObjectLiteral, R>(
    repository: Repository<T>,
    paginationParams: PaginationParamsDto,
    transformer: (data: T[]) => Promise<R[]> | R[],
    where?: FindOptionsWhere<T> | FindOptionsWhere<T>[],
    relations: string[] = [],
    additionalOptions: FindManyOptions<T> = {}
  ): Promise<PaginatedResult<R>> {
    const result = await this.paginate(
      repository,
      paginationParams,
      where,
      relations,
      additionalOptions
    );

    const transformedData = await transformer(result.data);

    return {
      data: transformedData,
      meta: result.meta,
    };
  }
}
