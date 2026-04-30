import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { BUSINESS_METADATA_KEY, BusinessTableMetadata, BusinessColumnMetadata } from '../decorators/business-metadata.decorator';
import 'reflect-metadata';

@Injectable()
export class SchemaMetadataService {
  private readonly logger = new Logger(SchemaMetadataService.name);
  private tableMetadataCache: Map<string, any> = new Map();
  private columnMetadataCache: Map<string, Map<string, BusinessColumnMetadata>> = new Map();

  constructor(private readonly dataSource: DataSource) {}

  /**
   * Initialise le cache des métadonnées à partir des entités TypeORM
   */
  async initializeMetadata() {
    const entities = this.dataSource.entityMetadatas;
    
    for (const entity of entities) {
      const tableName = entity.tableName;
      const entityClass = entity.target;
      
      // ✅ Vérifier si la table doit être ignorée
      let tableIgnored = true;
      try {
        const tableMeta = Reflect.getMetadata(BUSINESS_METADATA_KEY, entityClass) as BusinessTableMetadata;
        if (tableMeta) {
          tableIgnored = tableMeta.ignored === true; 
          if (!tableIgnored) {
            this.tableMetadataCache.set(tableName, tableMeta);
            this.logger.debug(`📋 Table: ${tableName} → ${tableMeta.label}`);
          } else {
            this.logger.debug(`⏭️ Table ignorée: ${tableName}`);
            continue; // ✅ Passer à la table suivante
          }
        }
      } catch (err) {
        this.logger.warn(`Impossible de lire métadonnées de table pour ${tableName}: ${(err as any).message}`);
      }
      
      // Métadonnées des colonnes
      const columnMap = new Map<string, BusinessColumnMetadata>();
      const prototype = (entityClass as Function).prototype;
      
      if (prototype && !tableIgnored) {
        for (const column of entity.columns) {
          const propName = column.propertyName;
          const dbColumnName = column.databaseName || propName;
          
          try {
            const columnMeta = Reflect.getMetadata(BUSINESS_METADATA_KEY, prototype, propName) as BusinessColumnMetadata;
            
            // ✅ Vérifier si la colonne doit être ignorée
            if (columnMeta) {
              if (columnMeta.ignored === true) {
                this.logger.debug(`⏭️ Colonne ignorée: ${tableName}.${dbColumnName}`);
                continue; // ✅ Ignorer cette colonne
              }
              
              columnMap.set(dbColumnName, columnMeta);
              columnMap.set(propName, columnMeta);
              this.logger.debug(`📝 Colonne: ${tableName}.${dbColumnName} → "${columnMeta.label}"`);
            }
          } catch (err) {
            this.logger.warn(`Impossible de lire métadonnée pour ${tableName}.${propName}: ${(err as any).message}`);
          }
        }
      }
      
      this.columnMetadataCache.set(tableName, columnMap);
      this.logger.log(`✅ ${tableName}: ${columnMap.size} colonnes métier chargées`);
    }
  }

  /**
   * Récupère le libellé métier d'une colonne
   */
  getBusinessLabel(tableName: string, columnName: string): string {
    const columnMap = this.columnMetadataCache.get(tableName);
    if (columnMap && columnMap.has(columnName)) {
      const label = columnMap.get(columnName)?.label;
      if (label) {
        return label;
      }
    }
    // Fallback: formatage automatique
    return this.formatTechnicalName(columnName);
  }

  /**
   * Récupère toutes les métadonnées d'une table pour générer le schéma
   */
  getTableMetadataForPrompt(tableName: string): BusinessTableMetadata | null {
    const meta = this.tableMetadataCache.get(tableName);
    return meta || null;
  }

  /**
 * Récupère le libellé métier d'une table
 */
getTableLabel(tableName: string): string {
  const meta = this.tableMetadataCache.get(tableName);
  return meta?.label || tableName;
}

/**
 * Récupère la description d'une colonne depuis les décorateurs
 */
  getColumnDescription(tableName: string, columnName: string): string {
    const columnMap = this.columnMetadataCache.get(tableName);
    if (columnMap) {
      // ✅ Essayer avec le nom exact
      let meta = columnMap.get(columnName);
      
      // ✅ Si pas trouvé, essayer en snake_case → camelCase
      if (!meta && columnName.includes('_')) {
        const camelCase = this.snakeToCamel(columnName);
        meta = columnMap.get(camelCase);
      }
      
      // ✅ Si pas trouvé, essayer en camelCase → snake_case
      if (!meta) {
        const snakeCase = this.camelToSnake(columnName);
        meta = columnMap.get(snakeCase);
      }
      
      if (meta?.description) {
        return meta.description;
      }
    }
    return '';
  }

  // Utilitaires
  private snakeToCamel(str: string): string {
    return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  }

  private camelToSnake(str: string): string {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
  }

  /**
   * Génère le schéma enrichi (identique à avant mais avec les vrais libellés)
   */
  async getRichSchemaForTables(tables: string[]): Promise<string> {
    let schema = '# SCHÉMA DE LA BASE DE DONNÉES (MÉTIER)\n\n';
    
    for (const table of tables) {
      const tableMeta = this.tableMetadataCache.get(table);
      const columnMap = this.columnMetadataCache.get(table);
      
      if (!columnMap) continue;
      
      // En-tête de table
      schema += `## ${tableMeta?.label || table} (${table})\n`;
      if (tableMeta?.description) schema += `${tableMeta.description}\n`;
      schema += '\n| Colonne technique | Type | Libellé métier | Description |\n';
      schema += '|------------------|------|----------------|-------------|\n';
      
      // Récupérer les vraies colonnes depuis information_schema pour avoir les types
      const columnsInfo = await this.getColumnsInfo(table);
      
      for (const col of columnsInfo) {
        const colName = col.COLUMN_NAME;
        const meta = columnMap.get(colName);
        const label = meta?.label || this.formatTechnicalName(colName);
        const description = meta?.description || '';
        schema += `| ${colName} | ${col.DATA_TYPE} | ${label} | ${description} |\n`;
      }
      
      schema += '\n';
    }
    
    return schema;
  }

  /**
   * Récupère les infos techniques des colonnes (depuis la base)
   */
  private async getColumnsInfo(table: string): Promise<any[]> {
    return this.dataSource.query(`
      SELECT COLUMN_NAME, DATA_TYPE 
      FROM information_schema.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
      ORDER BY ORDINAL_POSITION
    `, [table]);
  }

  /**
   * Formate un nom technique (ex: "first_name" → "Prénom")
   */
  private formatTechnicalName(name: string): string {
    return name
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Transforme une ligne de résultat en objet métier
   */
  transformRowToBusiness(row: any, tableName: string): any {
    const columnMap = this.columnMetadataCache.get(tableName);
    if (!columnMap) return row;
    
    const transformed: any = {};
    for (const [key, value] of Object.entries(row)) {
      const meta = columnMap.get(key);
      const label = meta?.label || this.formatTechnicalName(key);
      
      let formattedValue = value;
      if (meta?.format === 'date' && value) {
        formattedValue = this.formatDate(value);
      } else if (meta?.format === 'currency' && value) {
        formattedValue = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Number(value));
      }
      
      transformed[label] = formattedValue;
    }
    return transformed;
  }

  private formatDate(date: any): string {
    try {
      const d = new Date(date);
      return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch {
      return date;
    }
  }

    /**
  * Vérifie si une table a des métadonnées (donc visible)
  */
  hasTableMetadata(tableName: string): boolean {
    return this.tableMetadataCache.has(tableName);
  }

  /**
  * Retourne toutes les tables visibles (celles avec métadonnées)
  */
  getAllVisibleTables(): string[] {
    return Array.from(this.tableMetadataCache.keys());
  }

  /**
  * Retourne le nombre de tables visibles
  */
  getVisibleTablesCount(): number {
    return this.tableMetadataCache.size;
  }
}