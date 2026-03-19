// src/common/services/base.service.ts
import { plainToInstance } from 'class-transformer';
import {
  Repository,
  FindOptionsWhere,
  ILike,
  In,
  Between,
  ObjectLiteral,
  FindOptionsOrder,
  DeepPartial,
  FindManyOptions,
  MoreThanOrEqual,
  LessThanOrEqual,
  MoreThan,
  LessThan,
} from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { Injectable, Optional } from '@nestjs/common';



import { PaginationParamsDto } from '../../dto/pagination-params.dto';
import { PaginatedResult, PaginationServiceV1 } from '../pagination/paginations-v1.service';
import { MailService } from '../../emails/emails.service';
import { Mail } from '../../emails/entities/mail.entity';
import { CreateMailDto } from '../../emails/dto/create-mail.dto';




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
    protected readonly paginationService: PaginationServiceV1,
    @Optional() protected readonly emailsService?: MailService, // Optionnel
  ) {}


  async sendMail(createMailDto: CreateMailDto, deduplicationKey?: string): Promise<Mail | any> {
    if (this.emailsService) {
      return this.emailsService.create(createMailDto, deduplicationKey);
    }
    return null;
  }

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
    // ✅ MODIFICATION : Intégrer le tri depuis paginationParams
    const finalOrder = this.buildFinalOrder(order, paginationParams);
    
    return this.paginationService.paginate(
      this.repository,
      paginationParams || new PaginationParamsDto(),
      whereConditions,
      relations,
      { order: finalOrder }
    );
  }

   // 🔥 NOUVELLE MÉTHODE PRIVÉE À AJOUTER :
  /**
   * Construit l'ordre final en priorisant paginationParams.sort_by/sort_direction
   */
  private buildFinalOrder<T>(
    defaultOrder: FindOptionsOrder<T>,
    paginationParams?: PaginationParamsDto
  ): FindOptionsOrder<T> {
    // Si pas de tri spécifié dans paginationParams, utiliser l'ordre par défaut
    if (!paginationParams?.sort_by) {
      return defaultOrder;
    }

    const sortDirection = paginationParams.sort_direction || 'ASC';
    const finalOrder: FindOptionsOrder<T> = {} as FindOptionsOrder<T>;
    
    // Gestion des tris sur les relations (ex: "user.name")
    if (paginationParams.sort_by.includes('.')) {
      const parts = paginationParams.sort_by.split('.');
      let currentLevel: any = finalOrder;
      
      for (let i = 0; i < parts.length - 1; i++) {
        currentLevel[parts[i]] = currentLevel[parts[i]] || {};
        currentLevel = currentLevel[parts[i]];
      }
      
      currentLevel[parts[parts.length - 1]] = sortDirection;
    } else {
      // Tri simple
      finalOrder[paginationParams.sort_by as keyof FindOptionsOrder<T>] = 
      sortDirection as any;
    }
    
    return finalOrder;
  }

  /**
   * Recherche avec transformation des données (si besoin)
   */
  // Dans BaseServiceV1
  // Dans BaseServiceV1
  async searchWithTransformer<R>(
    criteria: SearchCriteria,
    dtoClass: new (...args: any[]) => R,
    paginationParams?: PaginationParamsDto,
    relations?: string[] | null,
    order?: FindOptionsOrder<T>
  ): Promise<PaginatedResult<R>> {
    
    this.debugConditions( criteria, {})
    
    const whereConditions = this.buildWhereConditionsV1(criteria, {}); 

    // ⚙️ Construire dynamiquement l'ordre en prenant en compte les relations
    const finalOrder = order ?? this.buildOrderWithRelations(
      paginationParams?.sort_by, 
      paginationParams?.sort_direction
    );

    const transformer = (data: T[]) =>
      plainToInstance(dtoClass, data, {
        excludeExtraneousValues: false,
        enableImplicitConversion: true,
      });

    relations = relations || this.getDefaultSearchOptions().relationFields;

    return this.paginationService.paginateWithTransformer(
      this.repository,
      paginationParams || new PaginationParamsDto(),
      transformer,
      whereConditions,
      relations,
      { order: finalOrder },
      dtoClass
    );
  }


  private buildOrderWithRelations(
    sortBy?: string, 
    sortDirection?: string
  ): FindOptionsOrder<any> {
    if (!sortBy) {
      return { created_at: 'ASC' } as FindOptionsOrder<any>;
    }

    // Vérifier si le tri concerne une relation (contient un point)
    if (sortBy.includes('.')) {
      const [relation, field] = sortBy.split('.');
      
      // Pour les relations, TypeORM nécessite une structure spécifique
      return {
        [relation]: {
          [field]: (sortDirection || 'ASC').toUpperCase()
        }
      } as FindOptionsOrder<any>;
    }

    // Tri simple sur un champ direct
    return {
      [sortBy]: (sortDirection || 'ASC').toUpperCase()
    } as FindOptionsOrder<any>;
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
/**
 * Construit les conditions WHERE complexes avec support des relations - VERSION CORRIGÉE
 */
/**
 * Construit les conditions WHERE complexes avec support des relations - VERSION CORRIGÉE
 */
/**
 * Construit les conditions WHERE complexes avec support des relations - VERSION ROBUSTE
 */
  protected buildWhereConditionsV1_old(
    criteria: SearchCriteria,
    searchOptions?: SearchOptions
  ): FindOptionsWhere<T> | FindOptionsWhere<T>[] {
    const defaultOptions = this.getDefaultSearchOptions();
    const options = { ...defaultOptions, ...searchOptions };
    const operatorPrefixes = [
      'between_', 'gt_', 'gte_', 'lt_', 'lte_', 'like_', 'in_'
    ];
    // ✅ CORRECTION : Utiliser des Sets pour éviter les doublons
    const searchFieldsSet = new Set<string>();
    const dateFieldsSet = new Set<string>();

    // Identifier tous les champs utilisés
    if (criteria.search && options.searchFields) {
      options.searchFields.forEach(field => searchFieldsSet.add(field));
    }

    if (options.dateRangeFields) {
      options.dateRangeFields.forEach(field => dateFieldsSet.add(field));
    }

    // ✅ CORRECTION : Exclure les champs de date de la recherche texte
    const searchOnlyFields = Array.from(searchFieldsSet).filter(field => 
      !dateFieldsSet.has(field) && 
      field !== 'created_at' && 
      field !== 'updated_at' &&
      !operatorPrefixes.some(prefix => field.startsWith(prefix))

    );

    const conditions: FindOptionsWhere<T>[] = [];

    // 1. Conditions de recherche texte (OR)
    if (criteria.search && searchOnlyFields.length > 0) {
      const searchConditions = this.buildSearchConditions(
        criteria.search.toString(),
        searchOnlyFields
      );
      conditions.push(...searchConditions);
    }

    // 2. Conditions AND (dates + autres critères)
    const andConditions: any = {};

    // Dates
    const dateConditions = this.buildDateRangeConditions(criteria, options);
    if (dateConditions) {
      Object.assign(andConditions, dateConditions);
    }

    // Autres critères spécifiques
    const specificConditions = this.buildSpecificConditions(criteria, options);
    if (Object.keys(specificConditions).length > 0) {
      Object.assign(andConditions, specificConditions);
    }

    // Ajouter les conditions AND seulement si elles ne contiennent pas de conflits
   // Si on a à la fois une recherche globale (OR) et des conditions AND
  if (criteria.search && searchOnlyFields.length > 0 && Object.keys(andConditions).length > 0) {
    const combinedConditions = searchOnlyFields.map(field => {
      const orCondition = field.includes('.')
        ? this.buildNestedCondition(field, criteria.search)
        : { [field]: ILike(`%${criteria.search}%`) };
      return { ...andConditions, ...orCondition };
    });
    return combinedConditions;
  }

  // Si seulement la recherche globale
  if (criteria.search && searchOnlyFields.length > 0) {
    return this.buildSearchConditions(criteria.search.toString(), searchOnlyFields);
  }

  // Si seulement des conditions spécifiques
  if (Object.keys(andConditions).length > 0) {
    return andConditions;
  }

  return {};

  }

  protected buildWhereConditionsV1(
    criteria: SearchCriteria,
    searchOptions?: SearchOptions
  ): FindOptionsWhere<T> | FindOptionsWhere<T>[] {
    const defaultOptions = this.getDefaultSearchOptions();
    const options = { ...defaultOptions, ...searchOptions };

    // ✅ 1. Séparer les critères
    const operatorPrefixes = ['between_', 'gt_', 'gte_', 'lt_', 'lte_', 'like_', 'in_'];
    
    const cleanCriteria: SearchCriteria = {};
    const operatorCriteria: SearchCriteria = {};
    
    for (const [key, value] of Object.entries(criteria)) {
      const hasOperator = operatorPrefixes.some(prefix => key.startsWith(prefix));
      if (hasOperator) {
        operatorCriteria[key] = value;  // Clés avec opérateurs (gt_montant_ttc)
      } else {
        cleanCriteria[key] = value;     // Clés normales (page, limit, status, search...)
      }
    }

    // ✅ 2. Conditions avec opérateurs
    const operatorConditions = this.buildConditionsWithOperators(operatorCriteria, options);
    
    // ✅ 3. Conditions simples (sans opérateurs)
    const simpleConditions = this.buildSpecificConditions(cleanCriteria, options);
    
    // ✅ 4. Fusionner les conditions AND
    const andConditions = { ...operatorConditions, ...simpleConditions };

    // ✅ 5. Conditions de recherche texte
    const searchFieldsSet = new Set<string>();
    const dateFieldsSet = new Set<string>();

    if (cleanCriteria.search && options.searchFields) {
      options.searchFields.forEach(field => searchFieldsSet.add(field));
    }

    if (options.dateRangeFields) {
      options.dateRangeFields.forEach(field => dateFieldsSet.add(field));
    }

    const searchOnlyFields = Array.from(searchFieldsSet).filter(field => 
      !dateFieldsSet.has(field) && 
      field !== 'created_at' && 
      field !== 'updated_at'
    );

    const searchConditions = cleanCriteria.search && searchOnlyFields.length > 0
      ? this.buildSearchConditions(cleanCriteria.search.toString(), searchOnlyFields)
      : [];

    // ✅ 6. Combinaison finale
    if (searchConditions.length > 0 && Object.keys(andConditions).length > 0) {
      return searchConditions.map(orCondition => ({ ...andConditions, ...orCondition }));
    }

    if (searchConditions.length > 0) {
      return searchConditions;
    }

    if (Object.keys(andConditions).length > 0) {
      return andConditions;
    }

    return {};
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
   * Construit les conditions pour les intervalles date_from/date_to
   */
  private buildDateRangeConditions(
    criteria: SearchCriteria,
    options: SearchOptions
  ): FindOptionsWhere<T> | null {
    const conditions: any = {};
    let hasDateConditions = false;

    // Gestion de date_from/date_to pour created_at
    if (criteria.date_from || criteria.date_to) {
      const dateFrom = criteria.date_from ? new Date(criteria.date_from) : undefined;
      const dateTo = criteria.date_to ? new Date(criteria.date_to) : undefined;
      
      if (dateFrom && dateTo) {
        conditions.created_at = Between(dateFrom, dateTo);
      } else if (dateFrom) {
        conditions.created_at = MoreThanOrEqual(dateFrom);
      } else if (dateTo) {
        conditions.created_at = LessThanOrEqual(dateTo);
      }
      
      hasDateConditions = true;
    }

    // Gestion générique pour tous les champs de date
    const dateFields = options.dateRangeFields || ['created_at', 'updated_at'];
    
    dateFields.forEach(field => {
      const fromKey = `${field}_from`;
      const toKey = `${field}_to`;
      
      if (criteria[fromKey] || criteria[toKey]) {
        const fromValue = criteria[fromKey] ? new Date(criteria[fromKey]) : undefined;
        const toValue = criteria[toKey] ? new Date(criteria[toKey]) : undefined;
        
        let dateCondition: any;
        
        if (fromValue && toValue) {
          dateCondition = Between(fromValue, toValue);
        } else if (fromValue) {
          dateCondition = MoreThanOrEqual(fromValue);
        } else if (toValue) {
          dateCondition = LessThanOrEqual(toValue);
        }
        
        if (dateCondition) {
          // Si le champ contient un point (relation), on construit une condition nested
          if (field.includes('.')) {
            const parts = field.split('.');
            let nestedCondition: any = {};
            
            const buildNestedDate = (parts: string[], current: any, condition: any): any => {
              if (parts.length === 1) {
                current[parts[0]] = condition;
              } else {
                current[parts[0]] = buildNestedDate(parts.slice(1), {}, condition);
              }
              return current;
            };
            
            Object.assign(conditions, buildNestedDate(parts, {}, dateCondition));
          } else {
            conditions[field] = dateCondition;
          }
          
          hasDateConditions = true;
        }
      }
    });

    return hasDateConditions ? conditions : null;
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
  private buildSpecificConditions_old(
    criteria: SearchCriteria,
    options: SearchOptions
  ): FindOptionsWhere<T> {
    const conditions: any = {};

    // Liste complète des champs à exclure
    const excludedFields = new Set([
      'search', 'page', 'limit', 'sort_by', 'sort_desc', 'sort_direction',
      'date_from', 'date_to', 'date_range'
    ]);

    // Ajouter tous les champs date_* à exclure
    if (options.dateRangeFields) {
      options.dateRangeFields.forEach(field => {
        excludedFields.add(`${field}_from`);
        excludedFields.add(`${field}_to`);
      });
    }

    for (const [key, value] of Object.entries(criteria)) {
      // Vérifier dans le Set des champs exclus
      if (excludedFields.has(key) || key.endsWith('_from') || key.endsWith('_to')) {
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
        // Champ de date range (format tableau) - garder pour compatibilité
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


  private buildSpecificConditions(
    criteria: SearchCriteria,
    options: SearchOptions
  ): FindOptionsWhere<T> {
    const conditions: any = {};

    const operatorPrefixes = ['between_', 'gt_', 'gte_', 'lt_', 'lte_', 'like_', 'in_'];

    // Liste complète des champs à exclure
    const excludedFields = new Set([
      'search', 'page', 'limit', 'sort_by', 'sort_desc', 'sort_direction',
      'date_from', 'date_to', 'date_range'
    ]);

    // Ajouter tous les champs date_* à exclure
    if (options.dateRangeFields) {
      options.dateRangeFields.forEach(field => {
        excludedFields.add(`${field}_from`);
        excludedFields.add(`${field}_to`);
      });
    }

    for (const [key, value] of Object.entries(criteria)) {
      // Ignorer les clés avec opérateurs
      if (operatorPrefixes.some(prefix => key.startsWith(prefix))) {
        continue;
      }

      // Ignorer les champs exclus
      if (excludedFields.has(key) || key.endsWith('_from') || key.endsWith('_to')) {
        continue;
      }

      if (value !== undefined && value !== null && value !== '') {
        // ✅ PRIORITÉ 1: Champ avec relation pointée
        if (key.includes('.')) {
          Object.assign(conditions, this.buildNestedCondition(key, value));
        } 
        // ✅ PRIORITÉ 2: Champ de recherche exacte
        else if (options.exactMatchFields?.includes(key)) {
          conditions[key] = value;  // Égalité exacte, pas de ILike
        }
        // ✅ PRIORITÉ 3: Champ de date range
        else if (options.dateRangeFields?.includes(key) && Array.isArray(value)) {
          conditions[key] = Between(value[0], value[1]);
        }
        // ✅ PRIORITÉ 4: Recherche IN (tableau)
        else if (Array.isArray(value)) {
          conditions[key] = In(value);
        }
        // ✅ PRIORITÉ 5: Par défaut, LIKE pour la recherche texte
        else {
          // Ne mettre en LIKE que si c'est un champ de recherche textuelle
          // Sinon, garder l'égalité exacte
          if (options.searchFields?.includes(key)) {
            conditions[key] = ILike(`%${value}%`);
          } else {
            conditions[key] = value;  // Égalité exacte par défaut
          }
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
 * Construit les conditions avec opérateurs dynamiques
 * Supporte: between_, gt_, gte_, lt_, lte_, like_, in_
 * Format: operateur_champ et valeur séparée par _ pour between
 */

  private buildConditionsWithOperators(
    criteria: SearchCriteria,
    options: SearchOptions
  ): FindOptionsWhere<T> {
    const conditions: any = {};
    
    console.log('=== buildConditionsWithOperators INPUT ===');
    console.log('criteria:', criteria);
    
    const operators = [
      { prefix: 'between_', handler: this.handleBetween },
      { prefix: 'gt_', handler: this.handleGreaterThan },
      { prefix: 'gte_', handler: this.handleGreaterThanOrEqual },
      { prefix: 'lt_', handler: this.handleLessThan },
      { prefix: 'lte_', handler: this.handleLessThanOrEqual },
      { prefix: 'like_', handler: this.handleLike },
      { prefix: 'in_', handler: this.handleIn }
    ];

    for (const [key, value] of Object.entries(criteria)) {
      console.log(`Traitement de ${key}=${value}`);
      
      if (value === undefined || value === null || value === '') continue;
      
      let matched = false;
      
      for (const operator of operators) {
        if (key.startsWith(operator.prefix)) {
          console.log(`✅ Match avec opérateur ${operator.prefix}`);
          const fieldName = key.substring(operator.prefix.length);
          console.log(`fieldName extrait: ${fieldName}`);
          
          // Vérifier que le champ existe dans l'entité
          if (this.isValidField(fieldName, options)) {
            console.log(`✅ Champ valide: ${fieldName}`);
            const condition = operator.handler.call(this, fieldName, value);
            console.log(`Condition générée:`, condition);
            Object.assign(conditions, condition);
          } else {
            console.log(`❌ Champ invalide: ${fieldName}`);
          }
          matched = true;
          break;
        }
      }
      
      if (!matched) {
        console.log(`❌ Aucun opérateur match pour ${key}`);
      }
    }
    
    console.log('=== buildConditionsWithOperators OUTPUT ===');
    console.log('conditions:', conditions);
    
    return conditions;
  }

  /**
   * Méthodes CRUD de base
   */
  async findOneV2(id: string | number, relations: string[] | null = []): Promise<T | null> {
    return this.repository.findOne({
      where: { id } as any,
      relations : this.getDefaultSearchOptions().relationFields,
    });
  }

  async findOneV1<DTO = T>(
  id: string | number, 
  relations: string[] | null = [],
  dtoClass?: new () => DTO
  ): Promise<DTO | T | null> {
  try {
    const result = await this.repository.findOne({
      where: { id } as any,
      relations: relations || this.getDefaultSearchOptions().relationFields,
    });
    
    if (!result) {
      return null;
    }
    
    if (dtoClass) {
      return plainToInstance(dtoClass, result, {
        excludeExtraneousValues: false,
        enableImplicitConversion: true,
      });
    }
    
    return result;
  } catch (error) {
    // Gérer l'erreur selon votre besoin
    throw new Error(`Erreur lors de la recherche de l'entité avec l'id ${id}: ${error.message}`);
  }
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
    await this.repository.update(id, data as QueryDeepPartialEntity<T>);
    const result = await this.findOneV1(id);
    if (!result) {
      throw new Error(`Entity with id ${id} not found after update`);
    }
    return result;
  }

  async updateManyV1(criteria: FindOptionsWhere<T>, data: DeepPartial<T>): Promise<void> {
    await this.repository.update(criteria, data as QueryDeepPartialEntity<T>);
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

  /**
   * Méthode de débogage pour vérifier les conditions construites
   */
  protected debugConditions(
    criteria: SearchCriteria,
    searchOptions: SearchOptions
  ): void {
    console.log('=== DEBUG BUILD WHERE CONDITIONS ===');
    console.log('Criteria reçu:', criteria);
    
    const dateConditions = this.buildDateRangeConditions(criteria, searchOptions);
    console.log('Date conditions construites:', dateConditions);
    
    const specificConditions = this.buildSpecificConditions(criteria, searchOptions);
    console.log('Specific conditions construites:', specificConditions);
    
    const finalConditions = this.buildWhereConditionsV1(criteria, searchOptions);
    console.log('Conditions finales:', finalConditions);
    
    console.log('====================================');
  }


  private handleBetween(field: string, value: any): any {
    // Format attendu: "2024-01-01_2024-12-31" ou "10_50"
    if (typeof value === 'string' && value.includes('_')) {
      const [min, max] = value.split('_').map(v => v.trim());
      
      // Détecter si c'est une date ou un nombre
      if (this.isDateString(min) && this.isDateString(max)) {
        return { [field]: Between(new Date(min), new Date(max)) };
      } else {
        const numMin = parseFloat(min);
        const numMax = parseFloat(max);
        if (!isNaN(numMin) && !isNaN(numMax)) {
          return { [field]: Between(numMin, numMax) };
        }
      }
    }
    return {};
  }

  private handleGreaterThan(field: string, value: any): any {
    console.log(`handleGreaterThan: field=${field}, value=${value}`);
    const numValue = this.parseNumericValue(value);
    console.log(`numValue parsé: ${numValue}`);
    if (numValue !== null) {
      return { [field]: MoreThan(numValue) };
    }
    return {};
  }

  private handleGreaterThanOrEqual(field: string, value: any): any {
    if (this.isDateString(value)) {
      return { [field]: MoreThanOrEqual(new Date(value)) };
    }
    
    const numValue = this.parseNumericValue(value);
    if (numValue !== null) {
      return { [field]: MoreThanOrEqual(numValue) };
    }
    return {};
  }

  private handleLessThan(field: string, value: any): any {
    const numValue = this.parseNumericValue(value);
    if (numValue !== null) {
      return { [field]: LessThan(numValue) };
    }
    return {};
  }

  private handleLessThanOrEqual(field: string, value: any): any {
    if (this.isDateString(value)) {
      return { [field]: LessThanOrEqual(new Date(value)) };
    }
    
    const numValue = this.parseNumericValue(value);
    if (numValue !== null) {
      return { [field]: LessThanOrEqual(numValue) };
    }
    return {};
  }

  private handleLike(field: string, value: any): any {
    if (typeof value === 'string') {
      return { [field]: ILike(`%${value}%`) };
    }
    return {};
  }

  private handleIn(field: string, value: any): any {
    if (typeof value === 'string' && value.includes(',')) {
      const values = value.split(',').map(v => v.trim());
      return { [field]: In(values) };
    }
    if (Array.isArray(value)) {
      return { [field]: In(value) };
    }
    return {};
  }

  private isValidField(fieldName: string, options: SearchOptions): boolean {
    // Vérifier si le champ existe dans les options ou est un champ standard
    const allFields = [
      ...(options.searchFields || []),
      ...(options.exactMatchFields || []),
      ...(options.dateRangeFields || []),
      'id', 'created_at', 'updated_at'
    ];
  
    return true//allFields.includes(fieldName) || fieldName.includes('.');
  }

  private parseNumericValue(value: any): number | null {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const num = parseFloat(value);
      return isNaN(num) ? null : num;
    }
    return null;
  }

  private isDateString(value: any): boolean {
    if (typeof value !== 'string') return false;
    // Format ISO ou YYYY-MM-DD
    const date = new Date(value);
    return date instanceof Date && !isNaN(date.getTime());
  }

  private handleSimpleField(
    key: string, 
    value: any, 
    options: SearchOptions, 
    conditions: any
  ): void {
    // Exclure les champs de contrôle
    const excludedFields = ['search', 'page', 'limit', 'sort_by', 'sort_desc', 'sort_direction'];
    if (excludedFields.includes(key)) return;

    if (key.includes('.')) {
      Object.assign(conditions, this.buildNestedCondition(key, value));
    } else if (options.exactMatchFields?.includes(key)) {
      conditions[key] = value;
    } else if (Array.isArray(value)) {
      conditions[key] = In(value);
    } else {
      conditions[key] = ILike(`%${value}%`);
    }
  }
}