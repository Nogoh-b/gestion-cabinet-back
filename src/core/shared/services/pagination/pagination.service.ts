// common/services/pagination.service.ts
import { ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import { Injectable } from '@nestjs/common';























import { DateRange, PaginatedResult, PaginationOptions, SearchOptions } from '../../interfaces/pagination.interface';
























@Injectable()
export class PaginationService {

  /**
   * Pagine un QueryBuilder en appliquant facultativement recherche et intervalle de dates
   * Retourne toujours un objet { data, meta }
   */
  async paginate<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
    options: PaginationOptions & { search?: SearchOptions; dateRange?: DateRange },  
    ): Promise<PaginatedResult<T>> {
    const page = options.page && options.page > 0 ? options.page : 1;
    const limit = options.limit != null ? options.limit : 10;

        // --- Appliquer recherche textuelle ---
// --- Appliquer recherche textuelle ---
const search = options.search;
if (search?.term) {
  // Récupération automatique des champs
  const mainAlias = qb.expressionMap.mainAlias!;
  const autoFields = mainAlias.metadata.columns
    .filter(col => {
      if (typeof col.type === 'string') {
        const t = (col.type as string).toLowerCase();
        return [
          'varchar', 'char', 'text', 'tinytext', 'mediumtext',
          'int', 'integer', 'bigint', 'decimal', 'float', 'double'
        ].includes(t);
      }
      return col.type === String || col.type === Number;
    })
    .map(col => col.propertyName);

  // Initialisation
  const conditions: string[] = [];
  const parameters: Record<string, any> = {};
  let paramIndex = 0;
  const fieldsToSearch: string[] = 
    (search.fields && search.fields.length > 0)
      ? search.fields
      : autoFields;
  fieldsToSearch.forEach(field => {
    const colMetadata = mainAlias.metadata.columns.find(c => c.propertyName === field);
    const isNumericField = colMetadata && (
      (typeof colMetadata.type === 'string' && 
       ['int','integer','bigint','decimal','float','double'].includes(colMetadata.type.toLowerCase())) ||
      (colMetadata.type === Number)
    );

    const column = `${qb.alias}.${field}`;
    
    if (isNumericField) {
      // Gestion numérique - recherche exacte ou LIKE
      const param = `term_num_${paramIndex++}`;
      
      if (search.exact) {
        // Recherche exacte numérique
        const numericValue = parseFloat(search.term);
        if (!isNaN(numericValue)) {
          conditions.push(`${column} = :${param}`);
          parameters[param] = numericValue;
        }
      } else {
        // Recherche LIKE numérique (converti en texte)
        conditions.push(`CAST(${column} AS CHAR) LIKE :${param}`);
        parameters[param] = `%${search.term}%`;
      }
    } else {
      // Gestion texte - recherche exacte ou LIKE
      const param = `term_txt_${paramIndex++}`;
      
      if (search.exact) {
        conditions.push(`${column} = :${param}`);
        parameters[param] = search.term;
      } else {
        conditions.push(`${column} LIKE :${param}`);
        parameters[param] = `%${search.term}%`;
      }
    }
  });

  if (conditions.length > 0) {
    qb.andWhere(`(${conditions.join(' OR ')})`, parameters);
  }
}




    // --- Appliquer intervalle de dates ---
    if (options.dateRange) {
      if (options.dateRange.from) {
        // Convertir la date en format SQL YYYY-MM-DD
        const fromDate = new Date(options.dateRange.from).toISOString().split('T')[0];
        qb.andWhere(`${qb.alias}.created_at >= :from`, { from: fromDate });
      }
      if (options.dateRange.to) {
        // Ajouter 1 jour pour inclure toute la journée
        const toDate = new Date(options.dateRange.to);
        toDate.setDate(toDate.getDate() + 1);
        qb.andWhere(`${qb.alias}.created_at < :to`, { to: toDate.toISOString().split('T')[0] });
      }
    }

    console.log('----query----- ', qb.getQuery())

    if (limit <= 0) {
      const data = await qb.getMany();
      const total = data.length;
      return {
        data,
        meta: {
          total,
          page,
          limit: total,
          totalPages: 1,
        },
      };
    }
    const skip = (page - 1) * limit;

    const [data, total] = await qb.skip(skip).take(limit).getManyAndCount();

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // Helper pour vérifier si une chaîne est un nombre
isNumeric(value: string): boolean {
  return /^-?\d+$/.test(value);
}

}
