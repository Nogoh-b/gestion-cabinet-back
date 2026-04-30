import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class SqlValidatorService {
  private readonly logger = new Logger(SqlValidatorService.name);
  private schemaColumnsCache: Map<string, Set<string>> = new Map();

  constructor(private readonly dataSource: DataSource) {}

  /**
   * Charge le cache des colonnes disponibles par table
   */
  async loadSchemaColumns(tables: string[]): Promise<void> {
    for (const table of tables) {
      if (!this.schemaColumnsCache.has(table)) {
        const columns = await this.dataSource.query(`
          SELECT COLUMN_NAME 
          FROM information_schema.COLUMNS 
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
        `, [table]);
        
        const columnSet = new Set<string>(columns.map(c => c.COLUMN_NAME.toLowerCase()));
        this.schemaColumnsCache.set(table, columnSet);
        this.logger.debug(`📋 Table ${table}: ${columnSet.size} colonnes chargées`);
      }
    }
  }

  /**
   * Valide et corrige une requête SQL génériquement
   */
  async validateAndFixSql(sqlQuery: string, tables: string[]): Promise<{ valid: boolean; fixedSql: string; errors: string[] }> {
    await this.loadSchemaColumns(tables);
    
    let fixedSql = sqlQuery;
    const errors: string[] = [];
    
    // Extraire toutes les colonnes mentionnées dans la requête
    const mentionedColumns = this.extractColumnsFromSql(fixedSql, tables);
    
    // Vérifier chaque colonne
    const corrections: { original: string; suggested: string; table: string }[] = [];
    for (const { table, column, originalName } of mentionedColumns) {
      const validColumns = this.schemaColumnsCache.get(table);
      if (validColumns && !validColumns.has(column.toLowerCase())) {
        // Colonne invalide - chercher une colonne similaire
        const suggestion = this.findSimilarColumn(column, validColumns);
        if (suggestion) {
          corrections.push({
            original: originalName,
            suggested: suggestion,
            table
          });
          errors.push(`Colonne '${originalName}' n'existe pas dans ${table}, suggestion: '${suggestion}'`);
        } else {
          errors.push(`Colonne '${originalName}' n'existe pas dans ${table} et aucune suggestion trouvée`);
        }
      }
    }
    
    // Appliquer les corrections
    for (const correction of corrections) {
      const regex = new RegExp(`\\b${correction.original}\\b`, 'gi');
      fixedSql = fixedSql.replace(regex, correction.suggested);
      this.logger.warn(`🔧 Correction: ${correction.original} → ${correction.suggested} dans ${correction.table}`);
    }
    
    // Supprimer les références à deleted_at
    if (fixedSql.toLowerCase().includes('deleted_at')) {
      fixedSql = this.removeDeletedAtConditions(fixedSql);
      errors.push('Condition sur deleted_at supprimée (colonne ignorée)');
    }
    
    // Ajouter LIMIT si absent
    if (!fixedSql.toLowerCase().includes('limit')) {
      fixedSql = fixedSql.replace(/;+$/, '') + ` LIMIT 50`;
    }
    
    return {
      valid: corrections.length === 0 && !fixedSql.toLowerCase().includes('deleted_at'),
      fixedSql,
      errors
    };
  }

  /**
   * Extrait toutes les colonnes d'une requête SQL avec leur table
   */
  private extractColumnsFromSql(sql: string, availableTables: string[]): { table: string; column: string; originalName: string }[] {
    const results: { table: string; column: string; originalName: string }[] = [];
    
    // Pattern pour capturer table.column ou juste column
    const patterns = [
      /(\w+)\.(\w+)/g,  // table.column
      /WHERE\s+(\w+)\s*(?:=|>|<|LIKE|IN)/gi,  // WHERE column
      /SELECT\s+(.+?)\s+FROM/gi,  // SELECT clause
      /ORDER BY\s+(\w+)/gi,  // ORDER BY column
      /GROUP BY\s+(\w+)/gi,  // GROUP BY column
      /JOIN\s+\w+\s+ON\s+(\w+)\.(\w+)\s*=\s*(\w+)\.(\w+)/gi  // JOIN conditions
    ];
    
    // Pattern 1: table.column
    let match;
    while ((match = patterns[0].exec(sql)) !== null) {
      results.push({
        table: match[1].toLowerCase(),
        column: match[2].toLowerCase(),
        originalName: match[2]
      });
    }
    
    // Pour les colonnes sans table, essayer de deviner la table
    const simpleColumns = this.extractSimpleColumns(sql);
    for (const col of simpleColumns) {
      // Chercher dans quelle table cette colonne pourrait exister
      for (const table of availableTables) {
        const validColumns = this.schemaColumnsCache.get(table);
        if (validColumns && validColumns.has(col.toLowerCase())) {
          results.push({
            table: table,
            column: col.toLowerCase(),
            originalName: col
          });
          break;
        }
      }
    }
    
    return results;
  }

  /**
   * Extrait les colonnes simples (sans préfixe table)
   */
  private extractSimpleColumns(sql: string): string[] {
    const columns: string[] = [];
    const patterns = [
      /WHERE\s+(\w+)\s*(?:=|>|<|LIKE|IN)/gi,
      /ORDER BY\s+(\w+)/gi,
      /GROUP BY\s+(\w+)/gi,
      /SELECT\s+(.*?)\s+FROM/gi
    ];
    
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(sql)) !== null) {
        if (match[1] && !match[1].includes('.') && !match[1].includes(',')) {
          columns.push(match[1]);
        } else if (match[1] && match[1].includes(',')) {
          // Split multiple columns
          const parts = match[1].split(',');
          for (const part of parts) {
            const trimmed = part.trim().split(' ')[0]; // Handle aliases
            if (trimmed && !trimmed.includes('.') && !trimmed.includes('(')) {
              columns.push(trimmed);
            }
          }
        }
      }
    }
    
    return [...new Set(columns)];
  }

  /**
   * Trouve une colonne similaire dans la table
   */
  private findSimilarColumn(invalidColumn: string, validColumns: Set<string>): string | null {
    const invalidLower = invalidColumn.toLowerCase();
    
    // Chercher une correspondance exacte
    if (validColumns.has(invalidLower)) {
      return invalidLower;
    }
    
    // Chercher des correspondances courantes
    const commonMappings: Record<string, string> = {
      'reference': 'dossier_number',
      'ref': 'dossier_number',
      'numero_dossier': 'dossier_number',
      'num_dossier': 'dossier_number',
      'client_name': 'name',
      'client_nom': 'last_name',
      'client_prenom': 'first_name',
      'date_creation': 'created_at',
      'date_modification': 'updated_at',
      'montant': 'amount',
      'prix': 'amount',
      'statut': 'status'
    };
    
    if (commonMappings[invalidLower]) {
      const mapped = commonMappings[invalidLower];
      if (validColumns.has(mapped)) {
        return mapped;
      }
    }
    
    // Chercher une colonne qui contient le même mot-clé
    for (const validCol of validColumns) {
      if (validCol.includes(invalidLower) || invalidLower.includes(validCol)) {
        return validCol;
      }
    }
    
    // Chercher une colonne avec un préfixe similaire
    const parts = invalidLower.split('_');
    if (parts.length > 0) {
      const base = parts[0];
      for (const validCol of validColumns) {
        if (validCol.startsWith(base)) {
          return validCol;
        }
      }
    }
    
    return null;
  }

  /**
   * Supprime les conditions sur deleted_at
   */
  private removeDeletedAtConditions(sql: string): string {
    let fixed = sql;
    
    // Supprimer les clauses WHERE contenant deleted_at
    fixed = fixed.replace(/\s+AND\s+deleted_at\s+IS\s+(NOT\s+)?NULL\s*/gi, '');
    fixed = fixed.replace(/\s+OR\s+deleted_at\s+IS\s+(NOT\s+)?NULL\s*/gi, '');
    fixed = fixed.replace(/WHERE\s+deleted_at\s+IS\s+(NOT\s+)?NULL\s*/gi, '');
    fixed = fixed.replace(/WHERE\s+deleted_at\s*=\s*NULL\s*/gi, '');
    
    // Nettoyer les WHERE vides
    fixed = fixed.replace(/WHERE\s+(?=ORDER|GROUP|LIMIT|$)/i, '');
    fixed = fixed.replace(/WHERE\s*;\s*$/i, '');
    
    return fixed;
  }

  /**
   * Génère un prompt enrichi avec les colonnes valides
   */
  async buildValidatedPrompt(question: string, schema: string, tables: string[]): Promise<string> {
    await this.loadSchemaColumns(tables);
    
    // Construire la liste des colonnes valides par table
    let validColumnsInfo = '\n📋 **COLONNES VALIDES PAR TABLE** :\n';
    for (const table of tables) {
      const columns = this.schemaColumnsCache.get(table);
      if (columns) {
        const columnList = Array.from(columns).join(', ');
        validColumnsInfo += `\n- ${table}: ${columnList}`;
      }
    }
    
    validColumnsInfo += '\n\n⚠️ **N\'utilise que les colonnes listées ci-dessus**\n';
    validColumnsInfo += '⚠️ La colonne "reference" n\'existe dans aucune table (utilise "dossier_number" pour les dossiers)\n';
    validColumnsInfo += '⚠️ La colonne "deleted_at" existe mais doit être ignorée (ne la mets jamais dans la requête)\n';
    
    return `Tu es un expert SQL.

${schema}

${validColumnsInfo}

Question: ${question}

Tables disponibles: ${tables.join(', ')}

Règles:
1. UNIQUEMENT SELECT
2. Utilise EXACTEMENT les colonnes listées ci-dessus
3. N'invente JAMAIS de colonnes
4. Ajoute LIMIT 50
5. Retourne UNIQUEMENT la requête SQL dans \`\`\`sql`;
  }
}