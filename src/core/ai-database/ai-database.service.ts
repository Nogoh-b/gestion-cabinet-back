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
  private cachedSchema: string | null = null;
  private schemaCacheTime: number = 0;
  private readonly CACHE_TTL = 3600000; // 1 heure
  private readonly MAX_RESULTS = 50;
  private readonly MAX_TOKENS = 2000;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async onModuleInit() {
    await this.initializeLLM();
    this.logger.log('✅ Service AI Database initialisé');
  }

  /**
   * Initialise uniquement le LLM (pas d'agent lourd)
   */
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
   * Version ultra-optimisée sans agent LangChain
   */
  async analyzeQuestion(dto: AskQuestionDto): Promise<AnalysisResponseDto> {
    const startTime = Date.now();

    try {
      this.logger.log(`📝 Question: ${dto.question.substring(0, 100)}...`);

      // 1. Obtenir le schéma (caché)
      const schema = await this.getOptimizedSchema(dto.specificTables);

      // 2. Générer la requête SQL
      const sqlQuery = await this.generateSQLQuery(dto.question, schema, dto.specificTables);

      console.log('eeeeeeeeeeeeeev ', schema , '----------', sqlQuery)

      // 3. Exécuter la requête si demandé
      let results :any = null;
      let analysis = '';

      if (sqlQuery && !dto.analyzeOnly) {
        results = await this.executeSafeQuery(sqlQuery);
        
        // 4. Analyser les résultats
        analysis = await this.analyzeResults(dto.question, sqlQuery, results);
      } else if (sqlQuery) {
        analysis = `Requête SQL générée:\n\`\`\`sql\n${sqlQuery}\n\`\`\``;
      }

      const executionTime = Date.now() - startTime;

      return {
        success: true,
        question: dto.question,
        sqlQuery,
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
   * Génère une requête SQL à partir de la question
   */
  private async generateSQLQuery(
    question: string,
    schema: string,
    specificTables?: string[],
  ): Promise<string> {
    const prompt = this.buildSQLPrompt(question, schema, specificTables);
    
    const response = await this.llm.invoke(prompt);
    const sql = this.extractSQL(response.content as string);
    
    if (!sql) {
      throw new Error('Impossible d\'extraire la requête SQL de la réponse');
    }
    
    return this.optimizeSQLQuery(sql);
  }

  /**
   * Construit un prompt optimisé pour la génération SQL
   */
  private buildSQLPrompt(question: string, schema: string, specificTables?: string[]): string {
    let prompt = `Tu es un expert SQL. Génère une requête SELECT pour répondre à la question.

Schéma de la base:
${schema}

Question: ${question}

Règles strictes:
1. UNIQUEMENT SELECT (pas de DELETE/UPDATE/INSERT/DROP)
2. Ajoute LIMIT ${this.MAX_RESULTS} à la fin
3. Utilise des alias clairs
4. Retourne UNIQUEMENT la requête SQL dans un bloc \`\`\`sql

Exemple de réponse:
\`\`\`sql
SELECT * FROM users LIMIT 10;
\`\`\``;

    if (specificTables?.length) {
      prompt += `\n\nTables autorisées uniquement: ${specificTables.join(', ')}`;
    }

    return prompt;
  }

  /**
   * Optimise la requête SQL générée
   */
  private optimizeSQLQuery(sql: string): string {
    let optimized = sql.trim();
    
    // Ajouter LIMIT si absent
    if (!optimized.toLowerCase().includes('limit')) {
      optimized = optimized.replace(/;+$/, '') + ` LIMIT ${this.MAX_RESULTS}`;
    }
    
    // Remplacer LIMIT trop grand
    const limitMatch = optimized.match(/LIMIT\s+(\d+)/i);
    if (limitMatch && parseInt(limitMatch[1]) > this.MAX_RESULTS) {
      optimized = optimized.replace(
        /LIMIT\s+\d+/i,
        `LIMIT ${this.MAX_RESULTS}`,
      );
    }
    
    return optimized;
  }

  /**
   * Exécute une requête SQL de façon sécurisée
   */
  private async executeSafeQuery(sqlQuery: string): Promise<{ data: any[]; rowCount: number }> {
    const normalizedQuery = sqlQuery.trim().toLowerCase();
    
    // Validation stricte
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
   * Analyse les résultats avec le LLM
   */
  private async analyzeResults(question: string, sql: string, results: any): Promise<string> {
    if (!results.data || results.data.length === 0) {
      return "La requête n'a retourné aucun résultat.";
    }
    
    const prompt = `Analyse ces résultats de base de données.

Question originale: ${question}
Requête SQL: ${sql}
Nombre de résultats: ${results.rowCount}
Premiers résultats: ${JSON.stringify(results.data.slice(0, 5), null, 2)}

Donne une réponse claire et concise en français (max 200 mots).`;

    const response = await this.llm.invoke(prompt);
    return response.content as string;
  }

  /**
   * Récupère un schéma optimisé avec cache
   */
  private async getOptimizedSchema(specificTables?: string[]): Promise<string> {
    // Vérifier le cache
    const now = Date.now();
    if (this.cachedSchema && (now - this.schemaCacheTime) < this.CACHE_TTL) {
      this.logger.debug('📦 Utilisation du schéma caché');
      return this.cachedSchema;
    }
    
    this.logger.log('🔄 Génération du schéma optimisé...');
    
    let schema = '';
    const tables = specificTables?.length 
      ? specificTables 
      : DatabaseTablesConfig.essentialTables.slice(0, 20); // Limiter à 8 tables
    
    for (const table of tables) {
      try {
        const tableSchema = await this.getTableSchemaOptimized(table);
        if (tableSchema) {
          schema += tableSchema + '\n';
        }
      } catch (error) {
        this.logger.warn(`Impossible de lire ${table}: ${(error as unknown as any).message}`);
      }
    }
    
    // Limiter la taille du schéma
    this.cachedSchema = schema.substring(0, 3000);
    this.schemaCacheTime = now;
    
    this.logger.log(`✅ Schéma généré (${this.cachedSchema.length} caractères)`);
    return this.cachedSchema;
  }

  /**
   * Récupère le schéma d'une table de façon optimisée
   */
  private async getTableSchemaOptimized(table: string): Promise<string | null> {
    // Récupérer uniquement les colonnes essentielles
    const columns = await this.dataSource.query(`
      SELECT 
        COLUMN_NAME,
        DATA_TYPE,
        COLUMN_KEY
      FROM information_schema.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = ?
        AND COLUMN_NAME NOT IN ('created_at', 'updated_at', 'deleted_at')
      ORDER BY ORDINAL_POSITION
      LIMIT 15
    `, [table]);
    
    if (columns.length === 0) return null;
    
    // Compter rapidement les lignes
    const countResult = await this.dataSource.query(
      `SELECT COUNT(*) as count FROM ${table}`,
    );
    const rowCount = countResult[0]?.count || 0;
    
    let schema = `Table ${table} (${rowCount.toLocaleString()} lignes):\n`;
    
    for (const col of columns) {
      const indicator = col.COLUMN_KEY === 'PRI' ? '🔑 ' : '   ';
      schema += `${indicator}${col.COLUMN_NAME}: ${col.DATA_TYPE}\n`;
    }
    
    return schema;
  }

  /**
   * Extrait la requête SQL de la réponse
   */
  private extractSQL(response: string): string | null {
    // Bloc markdown
    const markdownMatch = response.match(/```sql\n([\s\S]*?)\n```/i);
    if (markdownMatch) {
      return markdownMatch[1].trim();
    }
    
    // Requête SELECT simple
    const selectMatch = response.match(/SELECT\s+.*?(?:;|$)/is);
    if (selectMatch) {
      return selectMatch[0].trim().replace(/;+$/, '');
    }
    
    return null;
  }

  /**
   * Exécute une requête directement (endpoint sécurisé)
   */
  async executeQuery(sqlQuery: string): Promise<any> {
    const result = await this.executeSafeQuery(sqlQuery);
    return {
      success: true,
      data: result.data,
      rowCount: result.rowCount,
    };
  }

  /**
   * Valide une requête sans l'exécuter
   */
  async validateQuery(sqlQuery: string): Promise<{ valid: boolean; error?: string }> {
    try {
      // Vérifier la syntaxe avec EXPLAIN
      await this.dataSource.query(`EXPLAIN ${sqlQuery}`);
      return { valid: true };
    } catch (error) {
      return { valid: false, error: (error as unknown as any).message };
    }
  }

  /**
   * Récupère des métriques légères
   */
  async getDatabaseMetrics() {
    const metrics = {
      rowCounts: {} as Record<string, number>,
      lastAnalyzed: new Date(),
    };
    
    const tables = DatabaseTablesConfig.essentialTables.slice(0, 10);
    
    for (const table of tables) {
      try {
        const result = await this.dataSource.query(
          `SELECT COUNT(*) as count FROM ${table}`,
        );
        metrics.rowCounts[table] = parseInt(result[0]?.count || '0');
      } catch (error) {
        // Ignorer les erreurs
      }
    }
    
    return metrics;
  }

  /**
   * Rafraîchit le cache du schéma
   */
  async refreshSchema(): Promise<void> {
    this.cachedSchema = null;
    this.schemaCacheTime = 0;
    this.logger.log('✅ Cache du schéma vidé');
  }
}