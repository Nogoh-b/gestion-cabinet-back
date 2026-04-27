import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ChatOpenAI } from '@langchain/openai';
import { SqlDatabase } from 'langchain/sql_db';
import { AgentExecutor } from 'langchain/agents';
import { DatabaseTablesConfig } from './config/database-tables.config';
import { AskQuestionDto } from './dto/ask-question.dto';
import { AnalysisResponseDto } from './dto/analysis-response.dto';

@Injectable()
export class AiDatabaseService implements OnModuleInit {
  private readonly logger = new Logger(AiDatabaseService.name);
  private agent!: AgentExecutor;
  private sqlDatabase!: SqlDatabase;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async onModuleInit() {
    await this.initializeAgent();
  }

  /**
   * Initialise l'agent SQL avec LangChain
   */
  private async initializeAgent() {
    try {
      this.logger.log('🔄 Initialisation de l\'agent SQL...');

      // 1. Configurer la base de données LangChain
      this.sqlDatabase = await SqlDatabase.fromDataSourceParams({
        appDataSource: this.dataSource,
        includesTables: DatabaseTablesConfig.essentialTables,
        ignoreTables: DatabaseTablesConfig.ignoredTables,
        sampleRowsInTableInfo: DatabaseTablesConfig.sampling.sampleRows,
      });

      // 2. Configurer DeepSeek via OpenAI compatible
      const llm = new ChatOpenAI({
        model: 'deepseek-chat',
        temperature: 0,
        maxTokens: 4000,
        apiKey: process.env.DEEPSEEK_API_KEY,
        configuration: {
          baseURL: 'https://api.deepseek.com/v1',
        },
      });

      // 3. Créer l'agent - Utilisation de createSqlAgent depuis le bon chemin
      // Note: Dans certaines versions, createSqlAgent n'est pas exporté directement
      // On va utiliser l'approche avec createOpenAIToolsAgent à la place
      this.agent = await this.createSqlAgentWithTools(llm);

      this.logger.log('✅ Agent SQL initialisé avec succès');
    } catch (error) {
      this.logger.error(`❌ Erreur d'initialisation: ${(error as unknown as any).message}`);
      throw error;
    }
  }

  /**
   * Crée un agent SQL avec les outils appropriés
   */
  private async createSqlAgentWithTools(llm: ChatOpenAI): Promise<AgentExecutor> {
    // Importer les dépendances nécessaires
    const { createOpenAIToolsAgent } = await import('langchain/agents');
    const { DynamicStructuredTool } = await import('langchain/tools');
    const { z } = await import('zod');
    const { ChatPromptTemplate, MessagesPlaceholder } = await import('@langchain/core/prompts');

    // Créer un outil pour exécuter des requêtes SQL
    const sqlTool = new DynamicStructuredTool({
      name: 'execute_sql_query',
      description: 'Execute une requête SQL SELECT sur la base de données et retourne les résultats',
      schema: z.object({
        query: z.string().describe('La requête SQL SELECT à exécuter'),
      }),
      func: async ({ query }) => {
        // Vérification de sécurité
        const normalizedQuery = query.trim().toLowerCase();
        if (!normalizedQuery.startsWith('select')) {
          return 'Erreur: Seules les requêtes SELECT sont autorisées';
        }
        
        try {
          const results = await this.dataSource.query(query);
          // Limiter la taille des résultats
          const limitedResults = Array.isArray(results) ? results.slice(0, 100) : results;
          return JSON.stringify(limitedResults, null, 2);
        } catch (error) {
          return `Erreur SQL: ${(error as unknown as any).message}`;
        }
      },
    });

    // Obtenir le schéma de la base de données
    const schemaInfo = await this.getDatabaseSchema();
    
    // Créer le prompt
    const prompt = ChatPromptTemplate.fromMessages([
      ['system', `Tu es un expert SQL pour une base de données juridique et bancaire.
      
Voici le schéma de la base de données:
${schemaInfo}

Règles importantes:
1. N'utilise que des requêtes SELECT (jamais DELETE, UPDATE, INSERT)
2. Limite les résultats à 100 lignes maximum avec LIMIT 100
3. Privilégie les agrégations (COUNT, SUM, AVG) pour les analyses volumineuses
4. Ajoute toujours ORDER BY pour les classements
5. Inclus les jointures nécessaires (INNER JOIN, LEFT JOIN)
6. Utilise des alias de table pour plus de clarté

Réponds toujours avec la requête SQL et une explication claire des résultats.`],
      ['human', '{input}'],
      new MessagesPlaceholder('agent_scratchpad'),
    ]);

    // Créer l'agent
    const agent = await createOpenAIToolsAgent({
      llm,
      tools: [sqlTool],
      prompt,
    });

    // Créer l'exécuteur
    return new AgentExecutor({
      agent,
      tools: [sqlTool],
      verbose: process.env.NODE_ENV === 'development',
      maxIterations: 5,
    });
  }

  /**
   * Récupère le schéma complet de la base de données
   */
  private async getDatabaseSchema(): Promise<string> {
    let schema = '';
    
    for (const table of DatabaseTablesConfig.essentialTables) {
      try {
        // Récupérer la structure de la table
        const columns = await this.dataSource.query(`
          SELECT 
            COLUMN_NAME,
            DATA_TYPE,
            IS_NULLABLE,
            COLUMN_DEFAULT,
            COLUMN_KEY,
            EXTRA
          FROM information_schema.COLUMNS 
          WHERE TABLE_SCHEMA = DATABASE() 
            AND TABLE_NAME = '${table}'
          ORDER BY ORDINAL_POSITION
        `);
        
        schema += `\nTable: ${table}\n`;
        schema += `Description: ${DatabaseTablesConfig.tableDescriptions[table] || 'Non décrite'}\n`;
        schema += `Colonnes:\n`;
        
        for (const col of columns) {
          const constraints : any[] = [];
          if (col.COLUMN_KEY === 'PRI') constraints.push('PRIMARY KEY');
          if (col.COLUMN_KEY === 'MUL') constraints.push('FOREIGN KEY');
          if (col.EXTRA === 'auto_increment') constraints.push('AUTO_INCREMENT');
          if (col.IS_NULLABLE === 'NO') constraints.push('NOT NULL');
          
          schema += `  - ${col.COLUMN_NAME}: ${col.DATA_TYPE}`;
          if (constraints.length > 0) schema += ` [${constraints.join(', ')}]`;
          schema += '\n';
        }
        
        // Ajouter quelques exemples de données
        const samples = await this.dataSource.query(`
          SELECT * FROM ${table} LIMIT 2
        `);
        
        if (samples.length > 0) {
          schema += `Exemples de données:\n`;
          schema += JSON.stringify(samples, null, 2).substring(0, 500);
          schema += '\n';
        }
        
        schema += '\n';
      } catch (error) {
        this.logger.warn(`Impossible de récupérer le schéma pour ${table}: ${(error as unknown as any).message}`);
      }
    }
    
    return schema;
  }

  /**
   * Analyse une question naturelle sur la base de données
   */
  async analyzeQuestion(dto: AskQuestionDto): Promise<AnalysisResponseDto> {
    const startTime = Date.now();
    const startMemory = process.memoryUsage().heapUsed;

    try {
      // 1. Construire le prompt optimisé
      const enhancedPrompt = this.buildEnhancedPrompt(dto.question, dto.specificTables);

      // 2. Exécuter l'agent
      this.logger.log(`📝 Question: ${dto.question}`);
      const result = await this.agent.invoke({
        input: enhancedPrompt,
      });

      const executionTime = Date.now() - startTime;
      const memoryUsed = Math.round((process.memoryUsage().heapUsed - startMemory) / 1024 / 1024);

      // 3. Extraire la requête SQL de la réponse
      const sqlQuery = this.extractSQL(result.output);

      return {
        success: true,
        question: dto.question,
        sqlQuery,
        rawResults: result.intermediateSteps,
        analysis: result.output,
        executionTimeMs: executionTime,
        recommendations: this.extractRecommendations(result.output),
      };
    } catch (error) {
      this.logger.error(`❌ Erreur: ${(error as unknown as any).message}`);
      return {
        success: false,
        question: dto.question,
        analysis: `Erreur lors de l'analyse: ${(error as unknown as any).message}`,
        executionTimeMs: Date.now() - startTime,
        error: (error as unknown as any).message,
      };
    }
  }

  /**
   * Exécute une requête SQL arbitraire (avec sécurité)
   */
  async executeQuery(sqlQuery: string): Promise<any> {
    const normalizedQuery = sqlQuery.trim().toLowerCase();
    if (!normalizedQuery.startsWith('select')) {
      throw new Error('Seules les requêtes SELECT sont autorisées');
    }

    const forbiddenKeywords = ['drop', 'delete', 'update', 'insert', 'alter', 'create', 'truncate'];
    for (const keyword of forbiddenKeywords) {
      if (normalizedQuery.includes(keyword)) {
        throw new Error(`Le mot clé ${keyword} n'est pas autorisé`);
      }
    }

    try {
      const results = await this.dataSource.query(sqlQuery);
      return {
        success: true,
        data: results,
        rowCount: results.length,
      };
    } catch (error) {
      this.logger.error(`Erreur d'exécution SQL: ${(error as unknown as any).message}`);
      return {
        success: false,
        error: (error as unknown as any).message,
      };
    }
  }

  /**
   * Optimise le prompt pour l'agent
   */
  private buildEnhancedPrompt(question: string, specificTables?: string[]): string {
    let prompt = `Question: ${question}\n\n`;

    if (specificTables && specificTables.length > 0) {
      prompt += `⚠️ IMPORTANT: Utilise UNIQUEMENT ces tables: ${specificTables.join(', ')}\n\n`;
    }

    prompt += `Instructions:
1. Analyse la question et détermine la ou les tables nécessaires
2. Construis une requête SQL SELECT appropriée
3. Explique ton raisonnement
4. Retourne la requête SQL dans un bloc de code markdown

Commence par réfléchir à la structure de la requête, puis fournis la solution.`;

    return prompt;
  }

  /**
   * Extrait la requête SQL de la réponse
   */
  private extractSQL(response: string): string | undefined {
    const sqlRegex = /```sql\n([\s\S]*?)\n```/g;
    const matches = [...response.matchAll(sqlRegex)];
    
    if (matches.length > 0) {
      return matches[0][1].trim();
    }
    
    const selectRegex = /SELECT\s+.*?(?:;|$)/gis;
    const selectMatches = response.match(selectRegex);
    
    return selectMatches && selectMatches.length > 0 ? selectMatches[0].trim() : undefined;
  }

  /**
   * Extrait les recommandations de la réponse
   */
  private extractRecommendations(response: string): string[] {
    const recommendations: string[] = [];
    const lines = response.split('\n');
    
    for (const line of lines) {
      if (
        line.includes('Recommandation') ||
        line.includes('recommandation') ||
        line.includes('💡') ||
        line.includes('✅') ||
        line.includes('⚠️') ||
        line.match(/^\d+\./)
      ) {
        recommendations.push(line.trim());
      }
    }
    
    return recommendations.slice(0, 5);
  }

  /**
   * Récupère les métriques de performance des tables
   */
  async getDatabaseMetrics() {
    const metrics = {
      tableSizes: {},
      rowCounts: {},
      lastAnalyzed: new Date(),
      databaseSize: null as string | null,
    };

    try {
      const dbSizeResult = await this.dataSource.query(`
        SELECT 
          ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) AS size_mb
        FROM information_schema.tables
        WHERE table_schema = DATABASE()
      `);
      metrics.databaseSize = dbSizeResult[0]?.size_mb ? `${dbSizeResult[0].size_mb} MB` : null;
    } catch (error) {
      this.logger.warn(`Impossible de récupérer la taille DB: ${(error as unknown as any).message}`);
    }

    for (const table of DatabaseTablesConfig.essentialTables) {
      try {
        const rowCount = await this.dataSource.query(
          `SELECT COUNT(*) as count FROM ${table}`
        );
        metrics.rowCounts[table] = parseInt(rowCount[0].count);
      } catch (error) {
        this.logger.warn(`Impossible de compter ${table}: ${(error as unknown as any).message}`);
      }
    }

    return metrics;
  }

  /**
   * Valide une requête SQL sans l'exécuter
   */
  async validateQuery(sqlQuery: string): Promise<{ valid: boolean; error?: string }> {
    try {
      const explainQuery = `EXPLAIN ${sqlQuery}`;
      await this.dataSource.query(explainQuery);
      return { valid: true };
    } catch (error) {
      return { valid: false, error: (error as unknown as any).message };
    }
  }

  /**
   * Nettoie le cache et réinitialise l'agent
   */
  async refreshAgent(): Promise<void> {
    this.logger.log('🔄 Rafraîchissement de l\'agent...');
    await this.initializeAgent();
    this.logger.log('✅ Agent rafraîchi avec succès');
  }
}