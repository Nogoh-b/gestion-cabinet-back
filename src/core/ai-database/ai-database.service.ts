import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ChatOpenAI } from '@langchain/openai';
import { DatabaseTablesConfig } from './config/database-tables.config';
import { AskQuestionDto } from './dto/ask-question.dto';
import { AnalysisResponseDto } from './dto/analysis-response.dto';
import { SchemaMetadataService } from './schema-metadata.service';
import { SqlValidatorService } from './sql-validator.service';
import { ColumnSchema, DatabaseSchema, TableSchema } from './interface/schema.interface';

@Injectable()
export class AiDatabaseService implements OnModuleInit {
  private readonly logger = new Logger(AiDatabaseService.name);
  private llm!: ChatOpenAI;
  private schemaCache: Map<string, { schema: string; timestamp: number }> = new Map();
  private relationshipsCache: Map<string, any> = new Map();
  private columnLabelsCache: Map<string, any> = new Map();
  private readonly CACHE_TTL = 3600000; // 1 heure
  private readonly MAX_RESULTS = 50;
  private readonly MAX_TOKENS = 4000;
  private readonly MAX_CHARS = 180000;



  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly schemaMetadata: SchemaMetadataService,  
    private readonly sqlValidator: SqlValidatorService,  

  ) {}

  async onModuleInit() {
    await this.initializeLLM();
    await this.loadDatabaseRelationships();
      await this.schemaMetadata.initializeMetadata();  

    this.logger.log('✅ Service AI Database initialisé');
  }

  private async initializeLLM() {
    this.llm = new ChatOpenAI({
      model: 'deepseek-chat',
      temperature: 0.3, // Légèrement augmenté pour plus de naturel
      maxTokens: this.MAX_TOKENS,
      apiKey: process.env.DEEPSEEK_API_KEY,
      configuration: {
        baseURL: 'https://api.deepseek.com/v1',
      },
      timeout: 30000,
      maxRetries: 2,
    });
  }

  /**
   * Charge automatiquement toutes les relations de la base de données
   */
  private async loadDatabaseRelationships() {
    try {
      this.logger.log('🔄 Chargement automatique des relations...');
      
      const foreignKeys = await this.dataSource.query(`
        SELECT 
          kcu.TABLE_NAME,
          kcu.COLUMN_NAME,
          kcu.REFERENCED_TABLE_NAME,
          kcu.REFERENCED_COLUMN_NAME,
          tc.CONSTRAINT_NAME
        FROM information_schema.KEY_COLUMN_USAGE kcu
        JOIN information_schema.TABLE_CONSTRAINTS tc 
          ON kcu.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
          AND kcu.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA
        WHERE kcu.CONSTRAINT_SCHEMA = DATABASE()
          AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
          AND tc.CONSTRAINT_TYPE = 'FOREIGN KEY'
        ORDER BY kcu.TABLE_NAME, kcu.COLUMN_NAME
      `);
      
      const relationships = {};
      for (const fk of foreignKeys) {
        if (!relationships[fk.TABLE_NAME]) {
          relationships[fk.TABLE_NAME] = {
            foreignKeys: [],
            referencedBy: []
          };
        }
        
        relationships[fk.TABLE_NAME].foreignKeys.push({
          column: fk.COLUMN_NAME,
          referencedTable: fk.REFERENCED_TABLE_NAME,
          referencedColumn: fk.REFERENCED_COLUMN_NAME,
          constraint: fk.CONSTRAINT_NAME
        });
        
        if (!relationships[fk.REFERENCED_TABLE_NAME]) {
          relationships[fk.REFERENCED_TABLE_NAME] = {
            foreignKeys: [],
            referencedBy: []
          };
        }
        
        relationships[fk.REFERENCED_TABLE_NAME].referencedBy.push({
          table: fk.TABLE_NAME,
          column: fk.COLUMN_NAME,
          referencedColumn: fk.REFERENCED_COLUMN_NAME
        });
      }
      
      this.relationshipsCache.set('all', relationships);
      this.logger.log(`✅ ${foreignKeys.length} relations chargées`);
    } catch (error) {
      this.logger.warn(`Impossible de charger les relations: ${(error as unknown as any).message}`);
    }
  }

  async analyzeQuestion(dto: AskQuestionDto): Promise<AnalysisResponseDto> {
    const startTime = Date.now();

    try {
      this.logger.log(`📝 Question: ${dto.question.substring(0, 100)}...`);
      this.logger.log(`📊 Tables: ${dto.specificTables?.join(', ') || 'automatique'}`);

      const relevantTables = await this.detectRelevantTables(dto.question, dto.specificTables);
      const schema = await this.getCompleteSchema(relevantTables);
      const schemaJSON = await this.getCompleteSchemaJson(relevantTables);
      const sqlQuery = await this.generateSQLQuery(dto.question, schema, relevantTables);
      const validatedQuery = await this.validateAndFixQuery(sqlQuery, relevantTables);
      
      let results: any = null;
      let analysis = '';

      if (validatedQuery && !dto.analyzeOnly) {
        results = await this.executeSafeQuery(validatedQuery);
        analysis = await this.generateBusinessAnalysis(dto.question, validatedQuery, results, relevantTables);
      }

      const executionTime = Date.now() - startTime;

      return {
        success: true,
        question: dto.question,
        sqlQuery: validatedQuery,
        analysis,
        schemaJSON,
        schema,
        results: results?.data,
        executionTimeMs: executionTime,
        rowCount: results?.rowCount || 0,
      };
    } catch (error) {
      this.logger.error(`❌ Erreur: ${(error as unknown as any).message}`);
      return {
        success: false,
        question: dto.question,
        analysis: `Erreur: ${(error as unknown as any).message}`,
        executionTimeMs: Date.now() - startTime,
        error: (error as unknown as any).message,
      };
    }
  }

  /**
   * Génère une analyse métier à partir des résultats
   */
  private async generateBusinessAnalysis(
    question: string, 
    sql: string, 
    results: any, 
    tables: string[]
  ): Promise<string> {
    if (!results.data || results.data.length === 0) {
      return this.getNoResultsMessage(question, tables);
    }

    // Transformer les résultats avec des libellés métier
    const businessResults = this.transformToBusinessResults(results.data, tables);
    
    const prompt = `Tu es un expert métier spécialisé dans la gestion de dossiers contentieux et bancaires.

QUESTION POSÉE PAR L'UTILISATEUR:
"${question}"

RÉSULTATS DES DONNÉES (présentés en termes métier):
${JSON.stringify(businessResults, null, 2)}

INSTRUCTIONS IMPORTANTES:
1. Réponds comme si tu parlais à un collègue non technique (avocat, gestionnaire de dossier)
2. N'utilise JAMAIS de termes techniques comme "SQL", "requête", "base de données", "colonne", "table", "JOIN", "SELECT", "LIMIT"
3. Utilise des termes métier comme "dossier", "client", "étape", "procédure", "statut", "date"
4. Pour les champs, utilise des noms lisibles comme "Numéro de dossier", "Nom de l'étape" au lieu de "id", "name"
5. Si la réponse contient des dates, formate-les de façon lisible
6. Sois concis mais précis (max 150 mots)
7. Termine par une phrase d'action ou de recommandation si pertinent

RÉPONSE (en français courant, langage métier):`;

    const response = await this.llm.invoke(prompt);
    return response.content as string;
  }

  /**
   * Transforme les résultats techniques en résultats métier lisibles
   */
  private transformToBusinessResults(data: any[], tables: string[]): any[] {
    // Pour chaque ligne, on doit deviner de quelle table provient la colonne
    // Version simplifiée : on prend la première table de la liste comme contexte
    const mainTable = tables[0];
    return data.map(row => this.schemaMetadata.transformRowToBusiness(row, mainTable));
  }

  /**
   * Formate une date de façon lisible
   */
  private formatDate(date: any): string {
    try {
      const d = new Date(date);
      return d.toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });
    } catch {
      return date;
    }
  }

  /**
   * Message personnalisé quand aucun résultat n'est trouvé
   */
  private getNoResultsMessage(question: string, tables: string[]): string {
    // Détecter le type de question
    const lowerQuestion = question.toLowerCase();
    
    if (lowerQuestion.includes('étape') || lowerQuestion.includes('step')) {
      return "📋 **Aucune étape trouvée pour ce dossier.**\n\nCela peut signifier que :\n- Le dossier n'a pas encore commencé son parcours procédural\n- Le dossier n'est pas associé à une procédure active\n- L'identifiant du dossier est incorrect\n\n💡 **Recommandation :** Vérifiez l'identifiant du dossier ou consultez la fiche client pour confirmer la procédure associée.";
    }
    
    if (lowerQuestion.includes('dossier') || lowerQuestion.includes('dossiers')) {
      return "📁 **Aucun dossier trouvé correspondant à votre recherche.**\n\nCela peut être dû à :\n- Un numéro de dossier inexistant\n- Des critères de recherche trop restrictifs\n- Un dossier récemment archivé\n\n💡 **Recommandation :** Vérifiez le numéro de dossier ou élargissez vos critères de recherche.";
    }
    
    if (lowerQuestion.includes('client') || lowerQuestion.includes('customer')) {
      return "👤 **Aucun client trouvé correspondant à votre recherche.**\n\nVérifiez l'identifiant client ou les critères saisis.\n\n💡 **Recommandation :** Consultez l'annuaire clients ou contactez le service commercial.";
    }
    
    return "ℹ️ **Aucun résultat trouvé** pour votre question.\n\nVérifiez les informations saisies ou reformulez votre demande avec plus de précision.";
  }

  /**
   * Détecte automatiquement les tables pertinentes
   */
  /**
  * Détecte automatiquement les tables pertinentes (UNIQUEMENT celles avec métadonnées)
  */
  private async detectRelevantTables(question: string, specificTables?: string[]): Promise<string[]> {
    if (specificTables && specificTables.length > 0) {
      // ✅ Filtrer les tables spécifiques qui ont des métadonnées
      const validTables = specificTables.filter(table => 
        this.schemaMetadata.hasTableMetadata(table)
      );
      
      if (validTables.length === 0) {
        this.logger.warn(`⚠️ Aucune table spécifiée n'a de métadonnées, utilisation des tables par défaut`);
        return this.getDefaultVisibleTables();
      }
      
      return validTables;
    }

    const keywords = question.toLowerCase().split(/\s+/);
    
    // ✅ Récupérer UNIQUEMENT les tables qui ont des métadonnées
    const visibleTables = this.schemaMetadata.getAllVisibleTables();
    
    const tableScores: any[] = [];
    for (const tableName of visibleTables) {
      let score = 0;
      
      if (keywords.includes(tableName.toLowerCase())) score += 10;
      
      // Récupérer le label métier pour améliorer la détection
      const tableMeta = this.schemaMetadata.getTableMetadataForPrompt(tableName);
      const businessName = tableMeta?.label?.toLowerCase() || '';
      
      for (const keyword of keywords) {
        if (tableName.toLowerCase().includes(keyword) || keyword.includes(tableName.toLowerCase())) {
          score += 5;
        }
        if (businessName.includes(keyword) || keyword.includes(businessName)) {
          score += 7; // Score plus élevé pour le nom métier
        }
      }
      
      if (score > 0) {
        tableScores.push({ name: tableName, score });
      }
    }
    
    tableScores.sort((a, b) => b.score - a.score);
    const detectedTables = tableScores.slice(0, 10).map(t => t.name);
    
    this.logger.log(`🎯 Tables détectées: ${detectedTables.join(', ')}`);
    
    // ✅ Si aucune table détectée, retourner les tables par défaut visibles
    if (detectedTables.length === 0) {
      return this.getDefaultVisibleTables();
    }
    
    return detectedTables;
  }

  /**
  * Retourne la liste des tables visibles par défaut
  */
  private getDefaultVisibleTables(): string[] {
    const allVisible = this.schemaMetadata.getAllVisibleTables();
    // Retourner les 10 premières tables visibles
    return allVisible.slice(0, 10);
  }

  /**
   * Récupère un schéma complet avec toutes les relations
   */
  private async getCompleteSchema(tables: string[]): Promise<string> {
    // ✅ Filtrer pour ne garder que les tables avec métadonnées
    const validTables = tables.filter(table => 
      this.schemaMetadata.hasTableMetadata(table)
    );
    
    if (validTables.length === 0) {
      this.logger.warn(`⚠️ Aucune table valide trouvée, utilisation des tables par défaut visibles`);
      return this.getDefaultSchema();
    }
    
    const cacheKey = validTables.sort().join(',');
    const cached = this.schemaCache.get(cacheKey);
    const now = Date.now();
    
    if (cached && (now - cached.timestamp) < this.CACHE_TTL) {
      this.logger.debug(`📦 Utilisation du schéma caché pour ${validTables.length} tables`);
      return cached.schema;
    }
    
    this.logger.log(`🔄 Génération du schéma complet pour ${validTables.length} tables...`);
    
    let schema = '# SCHÉMA DE LA BASE DE DONNÉES\n\n';
    const relationships = this.relationshipsCache.get('all') || {};
    
    for (const table of validTables) {
      try {
        const tableInfo = await this.getTableInfo(table, relationships[table]);
        if (tableInfo) {
          schema += tableInfo + '\n';
        }
      } catch (error) {
        this.logger.warn(`Impossible de lire ${table}: ${(error as unknown as any).message}`);
      }
    }
    
    schema += '\n# RELATIONS ENTRE TABLES\n\n';
    for (const table of validTables) {
      const rel = relationships[table];
      if (rel?.foreignKeys) {
        for (const fk of rel.foreignKeys) {
          if (validTables.includes(fk.referencedTable)) {
            schema += `- ${table}.${fk.column} → ${fk.referencedTable}.${fk.referencedColumn}\n`;
          }
        }
      }
    }
    
    const finalSchema = schema.substring(0, 8000);
    this.schemaCache.set(cacheKey, { schema: finalSchema, timestamp: now });
    
    this.logger.log(`✅ Schéma généré (${finalSchema.length} caractères)`);
    return finalSchema;
  }

/**
 * Génère un schéma par défaut avec les tables visibles
 */
private async getDefaultSchema(): Promise<string> {
  const visibleTables = this.schemaMetadata.getAllVisibleTables();
  if (visibleTables.length === 0) {
    return "# Aucune table configurée\n\nVeuillez configurer les décorateurs BusinessTable sur vos entités.";
  }
  return this.getCompleteSchema(visibleTables);
}
  /**
  * Récupère les infos d'une table avec TOUS les détails des colonnes
  */
  private async getTableInfo(table: string, relationships?: any): Promise<string | null> {
    // Récupérer TOUTES les colonnes
    const columns = await this.dataSource.query(`
      SELECT 
        COLUMN_NAME,
        DATA_TYPE,
        COLUMN_TYPE,
        COLUMN_KEY,
        IS_NULLABLE,
        COLUMN_DEFAULT,
        EXTRA,
        CHARACTER_MAXIMUM_LENGTH,
        NUMERIC_PRECISION,
        NUMERIC_SCALE,
        COLUMN_COMMENT
      FROM information_schema.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
      ORDER BY ORDINAL_POSITION
    `, [table]);
    
    if (columns.length === 0) return null;
    
    // ✅ Récupérer les métadonnées pour savoir quelles colonnes ignorer
    const columnMetadata = this.columnLabelsCache.get(table) || new Map();
    
    // ✅ Filtrer les colonnes ignorées
    const visibleColumns = columns.filter(col => {
      let meta;
      if (columnMetadata instanceof Map) {
        meta = columnMetadata.get(col.COLUMN_NAME);
      }
      // Si la colonne a ignored=true, on l'exclut
      return !meta?.ignored;
    });
    
    // Compter les lignes
    let rowCount = 0;
    try {
      const countResult = await this.dataSource.query(`SELECT COUNT(*) as count FROM ${table}`);
      rowCount = parseInt(countResult[0]?.count || '0');
    } catch { /* ignore */ }
    
    // Construction du schéma enrichi
    let schema = `## Table ${table} (${rowCount.toLocaleString()} lignes)\n\n`;
    schema += '| Colonne technique | Type détaillé | Contraintes | Libellé métier | Description |\n';
    schema += '|------------------|---------------|-------------|----------------|-------------|\n';
    
    for (const col of visibleColumns) {  // ✅ Utiliser visibleColumns
      // Type détaillé
      let detailedType = col.DATA_TYPE;
      if (col.CHARACTER_MAXIMUM_LENGTH) {
        detailedType += `(${col.CHARACTER_MAXIMUM_LENGTH})`;
      } else if (col.NUMERIC_PRECISION) {
        detailedType += `(${col.NUMERIC_PRECISION}`;
        if (col.NUMERIC_SCALE) detailedType += `,${col.NUMERIC_SCALE}`;
        detailedType += `)`;
      }
      
      // Contraintes
      const constraints: any[] = [];
      if (col.COLUMN_KEY === 'PRI') constraints.push('🔑 PK');
      if (col.COLUMN_KEY === 'MUL') constraints.push('🔗 FK');
      if (col.IS_NULLABLE === 'NO') constraints.push('NOT NULL');
      if (col.EXTRA?.includes('auto_increment')) constraints.push('AUTO_INCREMENT');
      if (col.COLUMN_DEFAULT) constraints.push(`DEFAULT ${col.COLUMN_DEFAULT}`);
      
      // Libellé métier
      const businessLabel = this.schemaMetadata.getBusinessLabel(table, col.COLUMN_NAME);
      
      // Description
      let description = col.COLUMN_COMMENT || '';
      if (!description) {
        const metaDesc = this.schemaMetadata.getColumnDescription(table, col.COLUMN_NAME);
        description = metaDesc || this.getDefaultDescription(col.COLUMN_NAME);
      }
      
      schema += `| ${col.COLUMN_NAME} | ${detailedType} | ${constraints.join(', ') || '-'} | ${businessLabel} | ${description.substring(0, 60)}${description.length > 60 ? '...' : ''} |\n`;
    }
    
    // Ajouter les relations (filtrer aussi les colonnes FK ignorées)
    if (relationships?.foreignKeys?.length > 0) {
      schema += '\n### 🔗 Clés étrangères\n\n';
      for (const fk of relationships.foreignKeys) {
        // ✅ Vérifier si la colonne FK n'est pas ignorée
        let fkMeta;
        if (columnMetadata instanceof Map) {
          fkMeta = columnMetadata.get(fk.column);
        }
        if (!fkMeta?.ignored) {
          const fkLabel = this.schemaMetadata.getBusinessLabel(table, fk.column);
          const refTableLabel = this.schemaMetadata.getTableLabel(fk.referencedTable);
          schema += `- **${fkLabel}** (${fk.column}) → **${refTableLabel}** (${fk.referencedTable}.${fk.referencedColumn})\n`;
        }
      }
    }
    
    return schema;
  }

  private async getTableInfoJson(table: string, relationships?: any): Promise<TableSchema | null> {
    // ✅ Vérifier si la table doit être incluse (basé sur les métadonnées)
    const tableMeta = this.schemaMetadata.getTableMetadataForPrompt(table);
    
    // Si la table n'a PAS de métadonnées, elle ne doit pas être incluse
    if (!tableMeta) {
      this.logger.debug(`⏭️ Table sans métadonnées (ignorée): ${table}`);
      return null;
    }
    
    // Si la table est explicitement ignorée
    if (tableMeta.ignored === true) {
      this.logger.debug(`⏭️ Table explicitement ignorée: ${table}`);
      return null;
    }
    
    const columns = await this.dataSource.query(`
      SELECT 
        COLUMN_NAME,
        DATA_TYPE,
        COLUMN_TYPE,
        COLUMN_KEY,
        IS_NULLABLE,
        COLUMN_DEFAULT,
        EXTRA,
        CHARACTER_MAXIMUM_LENGTH,
        NUMERIC_PRECISION,
        NUMERIC_SCALE,
        COLUMN_COMMENT
      FROM information_schema.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
      ORDER BY ORDINAL_POSITION
    `, [table]);
    
    if (columns.length === 0) return null;
    
    // ✅ Récupérer les métadonnées des colonnes depuis le cache
    const columnMetadataMap = this.schemaMetadata.getColumnMetadataMap(table);
    
    // Compter les lignes
    let rowCount = 0;
    try {
      const countResult = await this.dataSource.query(`SELECT COUNT(*) as count FROM ${table}`);
      rowCount = parseInt(countResult[0]?.count || '0');
    } catch { /* ignore */ }
    
    const columnsSchema: ColumnSchema[] = [];
    const primaryKeys: string[] = [];
    const foreignKeysList: { column: string; references: { table: string; column: string } }[] = [];
    
    for (const col of columns) {
      // ✅ Vérifier si la colonne doit être ignorée
      const columnMeta = columnMetadataMap?.get(col.COLUMN_NAME);
      if (columnMeta?.ignored === true) {
        continue; // Ignorer cette colonne
      }
      
      // Type détaillé
      let detailedType = col.DATA_TYPE;
      if (col.CHARACTER_MAXIMUM_LENGTH) {
        detailedType += `(${col.CHARACTER_MAXIMUM_LENGTH})`;
      } else if (col.NUMERIC_PRECISION) {
        detailedType += `(${col.NUMERIC_PRECISION}`;
        if (col.NUMERIC_SCALE) detailedType += `,${col.NUMERIC_SCALE}`;
        detailedType += `)`;
      }
      
      // Contraintes
      const constraints: string[] = [];
      if (col.COLUMN_KEY === 'PRI') {
        constraints.push('PK');
        primaryKeys.push(col.COLUMN_NAME);
      }
      if (col.COLUMN_KEY === 'MUL') constraints.push('FK');
      if (col.IS_NULLABLE === 'NO') constraints.push('NOT NULL');
      if (col.EXTRA?.includes('auto_increment')) constraints.push('AUTO_INCREMENT');
      
      // ✅ Libellé métier (priorité: décorateur > généré)
      let businessLabel: string;
      let description: string;
      
      if (columnMeta) {
        businessLabel = columnMeta.label || this.schemaMetadata.formatTechnicalName(col.COLUMN_NAME);
        description = columnMeta.description || col.COLUMN_COMMENT || '';
      } else {
        businessLabel = this.schemaMetadata.formatTechnicalName(col.COLUMN_NAME);
        description = col.COLUMN_COMMENT || '';
      }
      
      // Vérifier si c'est une FK
      let isForeignKey = false;
      let foreignKeyTo: { table: string; column: string } | undefined;
      
      if (relationships?.foreignKeys) {
        const fk = relationships.foreignKeys.find((f: any) => f.column === col.COLUMN_NAME);
        if (fk) {
          isForeignKey = true;
          foreignKeyTo = {
            table: fk.referencedTable,
            column: fk.referencedColumn
          };
          foreignKeysList.push({
            column: col.COLUMN_NAME,
            references: { table: fk.referencedTable, column: fk.referencedColumn }
          });
        }
      }
      
      columnsSchema.push({
        name: col.COLUMN_NAME,
        type: detailedType,
        constraints,
        businessLabel,
        description: description.substring(0, 200),
        isForeignKey,
        foreignKeyTo
      });
    }
    
    return {
      name: table,
      businessName: tableMeta.label,
      description: tableMeta.description || '',
      rowCount,
      columns: columnsSchema,
      primaryKeys,
      foreignKeys: foreignKeysList,
      indexedColumns: []
    };
  }

  // Dans AiDatabaseService
  private async getCompleteSchemaJson(tables: string[]): Promise<DatabaseSchema> {
    const relationships = this.relationshipsCache.get('all') || {};
    const resultTables: TableSchema[] = [];
    const allRelationships: { from: { table: string; column: string }; to: { table: string; column: string } }[] = [];
    
    for (const table of tables) {
      // ✅ Vérifier si la table n'est pas ignorée
      const tableMeta = this.schemaMetadata.getTableMetadataForPrompt(table);
      this.logger.debug(`⏭️ Table (JSON): ${tableMeta}`);
      if (tableMeta?.ignored) {
        this.logger.debug(`⏭️ Table ignorée (JSON): ${table}`);
        continue;  // Passer cette table
      }
      
      const tableInfo = await this.getTableInfoJson(table, relationships[table]);
      if (tableInfo) {
        resultTables.push(tableInfo);
        
        // Ajouter les relations
        for (const fk of tableInfo.foreignKeys) {
          allRelationships.push({
            from: { table: tableInfo.name, column: fk.column },
            to: { table: fk.references.table, column: fk.references.column }
          });
        }
      }
    }
    
    return {
      database: process.env.DB_NAME || 'unknown',
      generatedAt: new Date().toISOString(),
      tables: resultTables,
      relationships: allRelationships
    };
  }

  private async generateSQLQuery(question: string, schema: string, tables: string[]): Promise<string> {
    // Utiliser le prompt validé
    const prompt = await this.sqlValidator.buildValidatedPrompt(question, schema, tables);
    const response = await this.llm.invoke(prompt);
    let sql = this.extractSQL(response.content as string);
    
    if (!sql) {
      throw new Error('Impossible d\'extraire la requête SQL');
    }
    
    // Valider et corriger automatiquement
    const validation = await this.sqlValidator.validateAndFixSql(sql, tables);
    
    if (!validation.valid) {
      this.logger.warn(`⚠️ Corrections appliquées: ${validation.errors.join(', ')}`);
    }
    
    return validation.fixedSql;
  }
  /**
  * Récupère une description par défaut pour une colonne technique
  */
  private getDefaultDescription(columnName: string): string {
    const descriptions: Record<string, string> = {
      id: 'Identifiant unique',
      created_at: 'Date de création',
      updated_at: 'Date de dernière modification',
      deleted_at: 'Date de suppression logique',
      status: 'Statut de l\'enregistrement',
      type: 'Type ou catégorie',
      name: 'Nom',
      title: 'Titre',
      description: 'Description détaillée',
      code: 'Code unique',
      reference: 'Référence externe',
      amount: 'Montant',
      date: 'Date',
      email: 'Adresse email',
      phone: 'Numéro de téléphone',
      address: 'Adresse postale',
      is_active: 'Est actif',
      is_deleted: 'Est supprimé',
      priority: 'Priorité',
      order: 'Ordre d\'affichage',
    };
    
    for (const [key, desc] of Object.entries(descriptions)) {
      if (columnName.toLowerCase().includes(key)) {
        return desc;
      }
    }
    return '—';
  }

  // Version améliorée du prompt
  private buildGenericPrompt(question: string, schema: string, tables: string[]): string {
    return `Tu es un expert SQL générant des requêtes POUR RÉPONDRE À UNE QUESTION MÉTIER.

  ${schema}

  📋 **QUESTION MÉTIER :** "${question}"

  🎯 **RÈGLES CRITIQUES :**

  1. **IGNORE TOTALEMENT** les colonnes "deleted_at", "deleted_by", "deleted_date"
  2. **NE JAMAIS filtrer** sur ces colonnes dans WHERE
  3. Utilise des alias courts (d = dossiers, c = customers)
  4. Ajoute toujours LIMIT ${this.MAX_RESULTS}
  5. Pour les dates, utilise DATE() si comparaison partielle

  ❌ **STRICTEMENT INTERDIT :**
  - DELETE, UPDATE, INSERT, DROP, ALTER, CREATE, TRUNCATE
  - Toute mention de "deleted_at" dans la requête

  ✅ **BONNE PRATIQUE :**
  \`\`\`sql
  SELECT d.id, d.reference, d.title 
  FROM dossiers d 
  WHERE d.status = 'active' 
  LIMIT 10;
  \`\`\`

  📤 **RÉPONSE UNIQUEMENT** avec la requête SQL dans un bloc \`\`\`sql`;
  }

  private async validateAndFixQuery(sqlQuery: string, tables: string[]): Promise<string> {
    let currentQuery = sqlQuery;
    let attempts = 0;
    const maxAttempts = 2;
    
    while (attempts < maxAttempts) {
      const validation = await this.validateQuery(currentQuery);
      
      if (validation.valid) {
        return currentQuery;
      }
      
      this.logger.warn(`Requête invalide (tentative ${attempts + 1}): ${validation.error}`);
      
      const fixPrompt = `Corrige cette requête SQL:
\`\`\`sql
${currentQuery}
\`\`\`
Erreur: ${validation.error}
Tables: ${tables.join(', ')}
Retourne UNIQUEMENT la requête corrigée.`;
      
      const response = await this.llm.invoke(fixPrompt);
      const fixedQuery = this.extractSQL(response.content as string);
      
      if (fixedQuery) {
        currentQuery = fixedQuery;
      }
      
      attempts++;
    }
    
    return currentQuery;
  }

  private basicQueryFix(sql: string): string {
    let fixed = sql;
    if (!fixed.toLowerCase().includes('limit')) {
      fixed = fixed.replace(/;+$/, '') + ` LIMIT ${this.MAX_RESULTS}`;
    }
    return fixed;
  }

  private async executeSafeQuery(sqlQuery: string): Promise<{ data: any[]; rowCount: number }> {
    const normalizedQuery = sqlQuery.trim().toLowerCase();
    
    if (!normalizedQuery.startsWith('select')) {
      throw new Error('Seules les requêtes SELECT sont autorisées');
    }
    
    const dangerousPatterns = [
      /^\s*drop\s+/m,
      /^\s*delete\s+from/m,
      /^\s*update\s+\w+\s+set/m,
      /^\s*insert\s+into/m,
      /^\s*alter\s+table/m,
      /^\s*create\s+/m,
      /^\s*truncate\s+/m,
      /^\s*exec(ute)?\s+/m
    ];
    
    for (const pattern of dangerousPatterns) {
      if (pattern.test(normalizedQuery)) {
        throw new Error(`Requête non autorisée détectée`);
      }
    }
    
    
    try {
      const results = await this.dataSource.query(sqlQuery);
      const limitedResults = results.slice(0, this.MAX_RESULTS);
      
      return {
        data: limitedResults,
        rowCount: limitedResults.length,
      };
    } catch (error) {
      throw new Error(`Erreur d'exécution: ${(error as unknown as any).message}`);
    }
  }

  private extractSQL(response: string): string | null {
    const patterns = [
      /```sql\n([\s\S]*?)\n```/i,
      /```\n([\s\S]*?)\n```/i,
      /SELECT\s+[\s\S]*?(?:;|$)/i
    ];
    
    for (const pattern of patterns) {
      const match = response.match(pattern);
      if (match) {
        const sql = match[1] || match[0];
        if (sql.toLowerCase().includes('select')) {
          return sql.trim().replace(/;+$/, '');
        }
      }
    }
    
    return null;
  }

  async validateQuery(sqlQuery: string): Promise<{ valid: boolean; error?: string }> {
    try {
      await this.dataSource.query(`EXPLAIN ${sqlQuery}`);
      return { valid: true };
    } catch (error) {
      return { valid: false, error: (error as unknown as any).message };
    }
  }

  async executeQuery(sqlQuery: string): Promise<any> {
    const result = await this.executeSafeQuery(sqlQuery);
    return {
      success: true,
      data: result.data,
      rowCount: result.rowCount,
    };
  }

  async getDatabaseMetrics() {
    const metrics = {
      rowCounts: {} as Record<string, number>,
      relationships: this.relationshipsCache.get('all') ? Object.keys(this.relationshipsCache.get('all')).length : 0,
      lastAnalyzed: new Date(),
    };
    
    const tables = DatabaseTablesConfig.essentialTables.slice(0, 10);
    for (const table of tables) {
      try {
        const result = await this.dataSource.query(`SELECT COUNT(*) as count FROM ${table}`);
        metrics.rowCounts[table] = parseInt(result[0]?.count || '0');
      } catch (error) {
        // Ignorer
      }
    }
    
    return metrics;
  }

  async refreshSchema(): Promise<void> {
    this.schemaCache.clear();
    await this.loadDatabaseRelationships();
    this.logger.log('✅ Caches vidés et relations rechargées');
  }

  /**
  * Retourne le schéma complet de la base avec toutes les métadonnées
  * Utilise les tables déjà sélectionnées par detectRelevantTables
  */
  async getFullDatabaseSchema(question?: string, specificTables?: string[]): Promise<any> {
    // Si une question est fournie, utiliser les tables détectées
    let tablesToUse: string[];
    
    if (question) {
      tablesToUse = await this.detectRelevantTables(question, specificTables);
    } else {
      // Sinon, utiliser les tables visibles (cellesfgetTableInfoJson avec métadonnées)
      tablesToUse = this.schemaMetadata.getAllVisibleTables();
    }
    
    this.logger.log(`📊 Génération du schéma JSON pour ${tablesToUse.length} tables`);
    
    const result = {
      database: process.env.DB_NAME,
      generatedAt: new Date().toISOString(),
      tables: {},
      relationships: [] as any[]
    };
    
    const relationships = this.relationshipsCache.get('all') || {};
    
    for (const table of tablesToUse) {
      try {
        const tableSchema = await this.getTableInfoJson(table, relationships[table]);
        if (tableSchema) {
          result.tables[table] = tableSchema;
          
          // Ajouter les relations
          if (relationships[table]?.foreignKeys) {
            for (const fk of relationships[table].foreignKeys) {
              result.relationships.push({
                from: { table, column: fk.column },
                to: { table: fk.referencedTable, column: fk.referencedColumn },
                type: 'belongsTo'
              });
            }
          }
        } else {
          this.logger.warn(`⚠️ Table ${table} ignorée (pas de schéma JSON généré)`);
        }
      } catch (error) {
        this.logger.error(`❌ Erreur génération schéma pour ${table}: ${(error as any).message}`);
      }
    }
    
    this.logger.log(`✅ Schéma JSON généré: ${Object.keys(result.tables).length} tables, ${result.relationships.length} relations`);
    
    return result;
  }


  /**
 * Retourne exactement ce qui est envoyé au prompt de l'IA
 * Utile pour debug et comprendre le contexte
 */
async getPromptSchema(question: string, specificTables?: string[]): Promise<any> {
  const startTime = Date.now();
  
  // Détecter les tables pertinentes
  const relevantTables = await this.detectRelevantTables(question, specificTables);
  
  // Générer le schéma complet (comme envoyé à l'IA)
  const schema = await this.getCompleteSchema(relevantTables);
  
  // Générer le prompt complet qui serait envoyé
  const prompt = this.buildGenericPrompt(question, schema, relevantTables);
  
  // Récupérer les métadonnées enrichies
  const tableMetadata: Array<{
    table: string;
    businessName: string;
    description: string;
    icon?: string;
    category?: string;
  }> = [];
  for (const table of relevantTables) {
    const meta = this.schemaMetadata.getTableMetadataForPrompt(table);
    if (meta) {
      tableMetadata.push({
        table,
        businessName: meta.label,
        description: meta.description,
        icon: meta.icon,
        category: meta.category
      });
    }
  }
  
  return {
    question,
    relevantTables,
    schemaPreview: schema.substring(0, 2000) + (schema.length > 2000 ? '\n... (tronqué)' : ''),
    schemaLength: schema.length,
    fullPrompt: prompt,
    promptLength: prompt.length,
    tableMetadata,
    executionTimeMs: Date.now() - startTime,
    // Version complète du schéma (optionnel, pour download)
    fullSchema: schema,
    // Relations entre tables
    relations: this.relationshipsCache.get('all') || {}
  };
}
}