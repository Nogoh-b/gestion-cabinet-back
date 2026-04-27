import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ChatOpenAI } from '@langchain/openai';
import { DatabaseTablesConfig } from './config/database-tables.config';
import { AskQuestionDto } from './dto/ask-question.dto';
import { AnalysisResponseDto } from './dto/analysis-response.dto';


@Injectable()
export class AiDatabaseService implements OnModuleInit {
  private readonly logger = new Logger(AiDatabaseService.name);
  private llm!: ChatOpenAI;
  private schemaCache: Map<string, { schema: string; timestamp: number }> = new Map();
  private relationshipsCache: Map<string, any> = new Map();
  private readonly CACHE_TTL = 3600000; // 1 heure
  private readonly MAX_RESULTS = 50;
  private readonly MAX_TOKENS = 4000;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async onModuleInit() {
    await this.initializeLLM();
    await this.loadDatabaseRelationships();
    this.logger.log('✅ Service AI Database initialisé');
  }

  private async initializeLLM() {
    this.llm = new ChatOpenAI({
      model: 'deepseek-chat',
      temperature: 0,
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
      
      // Récupérer toutes les foreign keys
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
      
      // Organiser les relations par table
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
        
        // Relations inverses
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

      // 1. Déterminer les tables pertinentes
      const relevantTables = await this.detectRelevantTables(dto.question, dto.specificTables);
      
      // 2. Obtenir le schéma complet avec relations
      const schema = await this.getCompleteSchema(relevantTables);
      
      // 3. Générer la requête SQL
      const sqlQuery = await this.generateSQLQuery(dto.question, schema, relevantTables);
      
      // 4. Valider et corriger la requête
      const validatedQuery = await this.validateAndFixQuery(sqlQuery, relevantTables);
      
      // 5. Exécuter la requête
      let results: any = null;
      let analysis = '';

      if (validatedQuery && !dto.analyzeOnly) {
        results = await this.executeSafeQuery(validatedQuery);
        analysis = await this.analyzeResults(dto.question, validatedQuery, results);
      }

      const executionTime = Date.now() - startTime;

      return {
        success: true,
        question: dto.question,
        sqlQuery: validatedQuery,
        analysis,
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
   * Détecte automatiquement les tables pertinentes
   */
  private async detectRelevantTables(question: string, specificTables?: string[]): Promise<string[]> {
    if (specificTables && specificTables.length > 0) {
      return specificTables;
    }

    // Extraire les mots-clés de la question
    const keywords = question.toLowerCase().split(/\s+/);
    
    // Récupérer toutes les tables de la base
    const allTables = await this.dataSource.query(`
      SELECT TABLE_NAME 
      FROM information_schema.TABLES 
      WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_TYPE = 'BASE TABLE'
    `);
    
    // Calculer la pertinence de chaque table
    const tableScores : any[] = [];
    for (const table of allTables) {
      const tableName = table.TABLE_NAME;
      let score = 0;
      
      // Vérifier si le nom de la table est dans les mots-clés
      if (keywords.includes(tableName.toLowerCase())) {
        score += 10;
      }
      
      // Vérifier les mots-clés partiels
      for (const keyword of keywords) {
        if (tableName.toLowerCase().includes(keyword) || keyword.includes(tableName.toLowerCase())) {
          score += 5;
        }
      }
      
      if (score > 0) {
        tableScores.push({ name: tableName, score });
      }
    }
    
    // Trier par score et prendre les 10 meilleures
    tableScores.sort((a, b) => b.score - a.score);
    const detectedTables = tableScores.slice(0, 10).map(t => t.name);
    
    this.logger.log(`🎯 Tables détectées: ${detectedTables.join(', ')}`);
    return detectedTables.length > 0 ? detectedTables : DatabaseTablesConfig.essentialTables.slice(0, 10);
  }

  /**
   * Récupère un schéma complet avec toutes les relations
   */
  private async getCompleteSchema(tables: string[]): Promise<string> {
    const cacheKey = tables.sort().join(',');
    const cached = this.schemaCache.get(cacheKey);
    const now = Date.now();
    
    if (cached && (now - cached.timestamp) < this.CACHE_TTL) {
      this.logger.debug(`📦 Utilisation du schéma caché pour ${tables.length} tables`);
      return cached.schema;
    }
    
    this.logger.log(`🔄 Génération du schéma complet pour ${tables.length} tables...`);
    
    let schema = '# SCHÉMA DE LA BASE DE DONNÉES\n\n';
    const relationships = this.relationshipsCache.get('all') || {};
    
    for (const table of tables) {
      try {
        // Structure de la table
        const tableInfo = await this.getTableInfo(table, relationships[table]);
        if (tableInfo) {
          schema += tableInfo + '\n';
        }
      } catch (error) {
        this.logger.warn(`Impossible de lire ${table}: ${(error as unknown as any).message}`);
      }
    }
    
    // Ajouter une section des relations globales
    schema += '\n# RELATIONS ENTRE TABLES\n\n';
    for (const table of tables) {
      const rel = relationships[table];
      if (rel?.foreignKeys) {
        for (const fk of rel.foreignKeys) {
          if (tables.includes(fk.referencedTable)) {
            schema += `- ${table}.${fk.column} → ${fk.referencedTable}.${fk.referencedColumn}\n`;
          }
        }
      }
    }
    
    // Ajouter des exemples de requêtes génériques
    schema += '\n# EXEMPLES DE JOINTURES STANDARDS\n';
    schema += 'Pour joindre deux tables, utilisez la relation définie ci-dessus.\n';
    schema += 'Exemple: SELECT * FROM table1 JOIN table2 ON table1.foreignKey = table2.id\n';
    
    const finalSchema = schema.substring(0, 8000);
    this.schemaCache.set(cacheKey, { schema: finalSchema, timestamp: now });
    
    this.logger.log(`✅ Schéma généré (${finalSchema.length} caractères)`);
    return finalSchema;
  }

  /**
   * Récupère les infos d'une table
   */
  private async getTableInfo(table: string, relationships?: any): Promise<string | null> {
    // Colonnes
    const columns = await this.dataSource.query(`
      SELECT 
        COLUMN_NAME,
        DATA_TYPE,
        COLUMN_KEY,
        IS_NULLABLE,
        COLUMN_DEFAULT,
        EXTRA
      FROM information_schema.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = ?
      ORDER BY ORDINAL_POSITION
      LIMIT 30
    `, [table]);
    
    if (columns.length === 0) return null;
    
    // Compter les lignes
    let rowCount = 0;
    try {
      const countResult = await this.dataSource.query(`SELECT COUNT(*) as count FROM ${table}`);
      rowCount = parseInt(countResult[0]?.count || '0');
    } catch (error) {
      rowCount = -1;
    }
    
    let schema = `## Table ${table}`;
    if (rowCount >= 0) schema += ` (${rowCount.toLocaleString()} lignes)`;
    schema += '\n\n';
    
    schema += '| Colonne | Type | Nullable | Clé |\n';
    schema += '|---------|------|----------|-----|\n';
    
    for (const col of columns) {
      let key = '';
      if (col.COLUMN_KEY === 'PRI') key = 'PRIMARY KEY';
      else if (col.COLUMN_KEY === 'MUL') key = 'FOREIGN KEY';
      else if (col.COLUMN_KEY === 'UNI') key = 'UNIQUE';
      
      schema += `| ${col.COLUMN_NAME} | ${col.DATA_TYPE} | ${col.IS_NULLABLE === 'YES' ? 'OUI' : 'NON'} | ${key} |\n`;
    }
    
    // Relations
    if (relationships?.foreignKeys?.length > 0) {
      schema += '\n**Relations:**\n';
      for (const fk of relationships.foreignKeys) {
        schema += `- ${fk.column} → ${fk.referencedTable}.${fk.referencedColumn}\n`;
      }
    }
    
    schema += '\n';
    return schema;
  }

  /**
   * Génère une requête SQL générique
   */
  private async generateSQLQuery(question: string, schema: string, tables: string[]): Promise<string> {
    const prompt = this.buildGenericPrompt(question, schema, tables);
    
    const response = await this.llm.invoke(prompt);
    const sql = this.extractSQL(response.content as string);
    
    if (!sql) {
      throw new Error('Impossible d\'extraire la requête SQL');
    }
    
    return sql;
  }

  /**
   * Prompt générique
   */
  private buildGenericPrompt(question: string, schema: string, tables: string[]): string {
    return `Tu es un expert SQL. Génère une requête SELECT pour répondre à la question.

${schema}

Question: ${question}

Tables disponibles: ${tables.join(', ')}

RÈGLES:
1. UNIQUEMENT SELECT (pas de DELETE/UPDATE/INSERT/DROP)
2. Ajoute LIMIT ${this.MAX_RESULTS} à la fin si pas déjà présent
3. Utilise les relations définies dans le schéma pour les JOIN
4. Utilise des alias de table (ex: dossiers d)
5. Pour les dossiers, utilise toujours dossiers.id pour identifier un dossier spécifique

Retourne UNIQUEMENT la requête SQL dans un bloc \`\`\`sql

Exemple de format:
\`\`\`sql
SELECT * FROM dossiers WHERE id = 61 LIMIT 1;
\`\`\``;
  }

  /**
   * Valide et corrige automatiquement la requête
   */
  private async validateAndFixQuery(sqlQuery: string, tables: string[]): Promise<string> {
    let currentQuery = sqlQuery;
    let attempts = 0;
    const maxAttempts = 3;
    
    while (attempts < maxAttempts) {
      // Vérifier la syntaxe
      const validation = await this.validateQuery(currentQuery);
      
      if (validation.valid) {
        return currentQuery;
      }
      
      this.logger.warn(`Requête invalide (tentative ${attempts + 1}): ${validation.error}`);
      
      // Demander au LLM de corriger
      const fixPrompt = `La requête SQL suivante est incorrecte:

\`\`\`sql
${currentQuery}
\`\`\`

Erreur: ${validation.error}

Tables autorisées: ${tables.join(', ')}

Corrige la requête en respectant le schéma. Retourne UNIQUEMENT la requête SQL corrigée dans un bloc \`\`\`sql.`;
      
      const response = await this.llm.invoke(fixPrompt);
      const fixedQuery = this.extractSQL(response.content as string);
      
      if (fixedQuery) {
        currentQuery = fixedQuery;
      }
      
      attempts++;
    }
    
    // Dernière tentative avec correction basique
    currentQuery = this.basicQueryFix(currentQuery);
    return currentQuery;
  }

  /**
   * Corrections basiques automatiques
   */
  private basicQueryFix(sql: string): string {
    let fixed = sql;
    
    // Correction 1: Ajouter LIMIT
    if (!fixed.toLowerCase().includes('limit')) {
      fixed = fixed.replace(/;+$/, '') + ` LIMIT ${this.MAX_RESULTS}`;
    }
    
    // Correction 2: Remplacer les jointures incorrectes courantes
    const commonFixes = [
      {
        pattern: /dossiers\s+\w+\s+JOIN\s+procedure_instances\s+\w+\s+ON\s+\w+\.id\s*=\s*\w+\.id/gi,
        replacement: (match: string) => {
          return match.replace(/\.id\s*=\s*(\w+)\.id/, '.procedureInstanceId = $1.id');
        }
      }
    ];
    
    for (const fix of commonFixes) {
      fixed = fixed.replace(fix.pattern, fix.replacement as any);
    }
    
    return fixed;
  }

  /**
   * Exécute une requête SQL de façon sécurisée
   */
  private async executeSafeQuery(sqlQuery: string): Promise<{ data: any[]; rowCount: number }> {
    const normalizedQuery = sqlQuery.trim().toLowerCase();
    
    if (!normalizedQuery.startsWith('select')) {
      throw new Error('Seules les requêtes SELECT sont autorisées');
    }
    
    const forbidden = ['drop', 'delete', 'update', 'insert', 'alter', 'create', 'truncate', 'exec', 'execute'];
    for (const word of forbidden) {
      if (normalizedQuery.includes(word)) {
        throw new Error(`Mot interdit détecté: ${word}`);
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

  /**
   * Analyse les résultats
   */
  private async analyzeResults(question: string, sql: string, results: any): Promise<string> {
    if (!results.data || results.data.length === 0) {
      return "La requête n'a retourné aucun résultat.";
    }
    
    const prompt = `Analyse ces résultats:

Question: ${question}
Requête SQL: ${sql}
Résultats (${results.rowCount} lignes): ${JSON.stringify(results.data.slice(0, 5), null, 2)}

Réponds en français, de façon claire et concise. En des termes des personnes du domaine d'activité  et non coté code ( programation)`;
    
    const response = await this.llm.invoke(prompt);
    return response.content as string;
  }

  /**
   * Extrait la requête SQL
   */
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

  /**
   * Valide une requête
   */
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
}