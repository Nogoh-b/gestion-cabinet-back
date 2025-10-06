// src/common/services/base.service.ts
import { Injectable } from '@nestjs/common';
import {
  Repository,
  FindOptionsWhere,
  ILike,
  In,
  Between,
  ObjectLiteral,
  FindOptionsOrder,
  DeepPartial,
  FindManyOptions
} from 'typeorm';
import { PaginatedResult, PaginationService } from '../pagination/paginations.service';
import { PaginationParamsDto } from '../../dto/pagination-params.dto';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';

export interface SearchCriteria {
  [key: string]: any;
}

export interface SearchOptions {
  searchFields?: string[];
  relationFields?: string[];
  exactMatchFields?: string[];
  dateRangeFields?: string[];
}

@Injectable()
export abstract class BaseServiceV1<T extends ObjectLiteral> {
  constructor(
    protected readonly repository: Repository<T>,
    protected readonly paginationService: PaginationService,
  ) {}

  /**
   * Recherche avancée avec support des relations pointées
   */
  async search(
    criteria: SearchCriteria,
    searchOptions?: SearchOptions,
    paginationParams?: PaginationParamsDto,
    relations: string[] = [],
    order: FindOptionsOrder<T> = { created_at: 'DESC' } as unknown as FindOptionsOrder<T>
  ): Promise<PaginatedResult<T>> {
    
    const whereConditions = this.buildWhereConditionsV1(criteria, searchOptions);
    
    // ✅ CORRECTION : Utiliser paginate au lieu de paginateWithTransformer
    return this.paginationService.paginate(
      this.repository,
      paginationParams || new PaginationParamsDto(),
      whereConditions,
      relations,
      { order }
    );
  }

  /**
   * Recherche avec transformation des données (si besoin)
   */
  async searchWithTransformer<R>(
    criteria: SearchCriteria,
    transformer: (data: T[]) => Promise<R[]> | R[],
    searchOptions?: SearchOptions,
    paginationParams?: PaginationParamsDto,
    relations: string[] = [],
    order: FindOptionsOrder<T> = { created_at: 'DESC' } as unknown as FindOptionsOrder<T>
  ): Promise<PaginatedResult<R>> {
    
    const whereConditions = this.buildWhereConditionsV1(criteria, searchOptions);
    
    return this.paginationService.paginateWithTransformer(
      this.repository,
      paginationParams || new PaginationParamsDto(),
      transformer,
      whereConditions,
      relations,
      { order }
    );
  }

  /**
   * Recherche simple (sans pagination)
   */
  async findAllV1(
    criteria: SearchCriteria = {},
    searchOptions?: SearchOptions,
    relations: string[] = [],
    order: FindOptionsOrder<T> = { created_at: 'DESC' } as unknown as FindOptionsOrder<T>
  ): Promise<T[]> {
    const whereConditions = this.buildWhereConditionsV1(criteria, searchOptions);
    
    return this.repository.find({
      where: whereConditions,
      relations,
      order,
    });
  }

  /**
   * Recherche avec options FindManyOptions complètes
   */
  async findWithOptions(options: FindManyOptions<T>): Promise<[T[], number]> {
    return this.repository.findAndCount(options);
  }

  /**
   * Construit les conditions WHERE complexes avec support des relations
   */
  protected buildWhereConditionsV1(
    criteria: SearchCriteria,
    searchOptions?: SearchOptions
  ): FindOptionsWhere<T> | FindOptionsWhere<T>[] {
    const conditions: FindOptionsWhere<T>[] = [];
    const defaultOptions = this.getDefaultSearchOptions();

    const options = { ...defaultOptions, ...searchOptions };

    // Traitement de la recherche globale (champ 'search')
    if (criteria.search) {
      const entityMetadata = this.repository.metadata;
      
      // ✅ Si searchFields n’est pas défini, on prend tous les champs simples
      const fieldsToSearch = options?.searchFields?.length
        ? options.searchFields
        : entityMetadata.columns.map(col => col.propertyName);

      const searchConditions = this.buildSearchConditions(
        criteria.search.toString(),
        fieldsToSearch
      );
      conditions.push(...searchConditions);
    }


    // Traitement des critères spécifiques
    const specificConditions = this.buildSpecificConditions(criteria, options);
    if (Object.keys(specificConditions).length > 0) {
      conditions.push(specificConditions);
    }

    return conditions.length > 0 ? (conditions.length === 1 ? conditions[0] : conditions) : {};
  }

  /**
   * Construit les conditions de recherche textuelle avec support des relations
   */
  private buildSearchConditions(
    searchTerm: string,
    searchFields: string[]
  ): FindOptionsWhere<T>[] {
    if (!searchTerm || searchFields.length === 0) {
      return [];
    }

    return searchFields.map(field => {
      // Si le champ contient un point, c'est une relation
      if (field.includes('.')) {
        return this.buildNestedCondition(field, searchTerm);
      } else {
        // Champ simple
        return { [field]: ILike(`%${searchTerm}%`) } as FindOptionsWhere<T>;
      }
    });
  }

  /**
   * Construit une condition pour les relations pointées (ex: client.first_name)
   */
  private buildNestedCondition(fieldPath: string, value: any): FindOptionsWhere<T> {
    const parts = fieldPath.split('.');
    let condition: any = {};

    // Construction récursive de la condition nested
    const buildNested = (parts: string[], current: any, val: any): any => {
      if (parts.length === 1) {
        current[parts[0]] = ILike(`%${val}%`);
      } else {
        current[parts[0]] = buildNested(parts.slice(1), {}, val);
      }
      return current;
    };

    return buildNested(parts, condition, value);
  }

  /**
   * Construit les conditions pour les critères spécifiques
   */
  private buildSpecificConditions(
    criteria: SearchCriteria,
    options: SearchOptions
  ): FindOptionsWhere<T> {
    const conditions: any = {};

    for (const [key, value] of Object.entries(criteria)) {
      // Ignorer les champs spéciaux
      if (['search', 'page', 'limit', 'sort_by', 'sort_desc', 'sort_direction','date_from','date_to'].includes(key)) {
        continue;
      }

      if (value !== undefined && value !== null && value !== '') {
        // Champ avec relation pointée
        if (key.includes('.')) {
          Object.assign(conditions, this.buildNestedCondition(key, value));
        } 
        // Champ de recherche exacte
        else if (options.exactMatchFields?.includes(key)) {
          conditions[key] = value;
        }
        // Champ de date range
        else if (options.dateRangeFields?.includes(key) && Array.isArray(value)) {
          conditions[key] = Between(value[0], value[1]);
        }
        // Champ avec recherche IN (tableau)
        else if (Array.isArray(value)) {
          conditions[key] = In(value);
        }
        // Recherche LIKE par défaut
        else {
          conditions[key] = ILike(`%${value}%`);
        }
      }
    }

    return conditions as FindOptionsWhere<T>;
  }

  /**
   * Options de recherche par défaut (à override dans les services enfants)
   */
  protected getDefaultSearchOptions(): SearchOptions {
    return {
      searchFields: ['name'], // Champs par défaut pour la recherche globale
      exactMatchFields: ['id', 'status'], // Champs pour recherche exacte
      dateRangeFields: ['created_at', 'updated_at'], // Champs pour ranges de dates
    };
  }

  /**
   * Méthodes CRUD de base
   */
  async findOneV1(id: string | number, relations: string[] = []): Promise<T | null> {
    return this.repository.findOne({
      where: { id } as any,
      relations,
    });
  }

  async findByIdsV1(ids: (string | number)[], relations: string[] = []): Promise<T[]> {
    return this.repository.find({
      where: { id: In(ids) } as any,
      relations,
    });
  }

  async createV1(data: DeepPartial<T>): Promise<T> {
    const entity = this.repository.create(data);
    return this.repository.save(entity);
  }

  async createManyV1(data: DeepPartial<T>[]): Promise<T[]> {
    const entities = this.repository.create(data);
    return this.repository.save(entities);
  }

  async updateV1(id: string | number, data: DeepPartial<T>): Promise<T> {
    await this.repository.update(id, data  as QueryDeepPartialEntity<T>);
    const result = await this.findOneV1(id);
    if (!result) {
      throw new Error(`Entity with id ${id} not found after update`);
    }
    return result;
  }

  async updateManyV1(criteria: FindOptionsWhere<T>, data: DeepPartial<T>): Promise<void> {
    await this.repository.update(criteria, data  as QueryDeepPartialEntity<T>);
  }

  async removeV1(id: string | number): Promise<void> {
    await this.repository.softDelete(id);
  }

  async removeManyV1(criteria: FindOptionsWhere<T>): Promise<void> {
    await this.repository.softDelete(criteria);
  }

  async count(criteria: SearchCriteria = {}, searchOptions?: SearchOptions): Promise<number> {
    const whereConditions = this.buildWhereConditionsV1(criteria, searchOptions);
    return this.repository.count({ where: whereConditions });
  }

  /**
   * Vérifie si une entité existe
   */
  async exists(criteria: FindOptionsWhere<T>): Promise<boolean> {
    const count = await this.repository.count({ where: criteria });
    return count > 0;
  }

  /**
   * Récupère la première entité correspondant aux critères
   */
  async findFirst(
    criteria: SearchCriteria,
    searchOptions?: SearchOptions,
    relations: string[] = []
  ): Promise<T | null> {
    const whereConditions = this.buildWhereConditionsV1(criteria, searchOptions);
    return this.repository.findOne({
      where: whereConditions,
      relations,
    });
  }
}